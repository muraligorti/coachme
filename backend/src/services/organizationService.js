// ═══════════════════════════════════════════════════════════════════════
// ORGANIZATION SERVICE — gyms hiring multiple coaches. Every function
// that touches a specific org's data verifies the caller actually
// belongs to THAT org (or is platform ADMIN) before doing anything -
// never trust an orgId passed in from the client without checking the
// caller's real membership against it. This is the tenant-segregation
// boundary; get it wrong here and it's wrong everywhere downstream.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as orgRepository from "../repositories/organizationRepository.js";
import * as userRepository from "../repositories/userRepository.js";

const VALID_TIERS = ["FREE", "STARTER", "PRO", "ELITE", "PREMIUM"];

// ── Access checks — the tenant boundary itself ─────────────────────────

async function requireOrgAdmin(userId, userRole, organizationId) {
  if (userRole === "ADMIN") return; // platform admin can always act on any org
  const membership = await orgRepository.findMembership(userId, organizationId);
  if (!membership || membership.role !== "ADMIN") {
    throw new AppError(403, "Only this gym's admin can do that");
  }
  return membership;
}

async function requireOrgMember(userId, userRole, organizationId) {
  if (userRole === "ADMIN") return;
  const membership = await orgRepository.findMembership(userId, organizationId);
  if (!membership) throw new AppError(403, "You're not a member of this gym");
  return membership;
}

// ── Organization lifecycle ─────────────────────────────────────────────

// Platform admin only, by design - a gym doesn't self-serve into
// existence, matching the decision that admin always retains the
// ability to set gyms up directly.
export async function createOrganization(actorRole, { name, tier, maxClients, city, country }) {
  if (actorRole !== "ADMIN") throw new AppError(403, "Only platform admin can create a gym");
  if (!name?.trim()) throw new AppError(400, "Gym name is required");
  if (tier && !VALID_TIERS.includes(tier)) throw new AppError(400, `Invalid tier: ${tier}`);
  return orgRepository.create({ name: name.trim(), tier: tier || "STARTER", maxClients: maxClients || 25, city, country });
}

export async function updateOrganization(actorUserId, actorRole, orgId, changes) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);
  const allowed = {};
  if (changes.name) allowed.name = changes.name.trim();
  if (changes.city !== undefined) allowed.city = changes.city;
  if (changes.country !== undefined) allowed.country = changes.country;
  // Tier/maxClients (billing) - platform admin only, not gym admins
  // themselves, same principle as coaches not being able to upgrade
  // their own tier.
  if (actorRole === "ADMIN") {
    if (changes.tier) { if (!VALID_TIERS.includes(changes.tier)) throw new AppError(400, `Invalid tier: ${changes.tier}`); allowed.tier = changes.tier; }
    if (changes.maxClients !== undefined) allowed.maxClients = changes.maxClients;
  }
  const org = await orgRepository.findById(orgId);
  if (!org) throw new AppError(404, "Gym not found");
  return orgRepository.update(orgId, allowed);
}

export async function getOrganization(actorUserId, actorRole, orgId) {
  await requireOrgMember(actorUserId, actorRole, orgId);
  const org = await orgRepository.findById(orgId);
  if (!org) throw new AppError(404, "Gym not found");
  return org;
}

export async function getMyOrganizations(userId) {
  const memberships = await orgRepository.findMembershipsForUser(userId);
  return memberships.map(m => ({ organization: m.organization, role: m.role }));
}

// ── Membership ──────────────────────────────────────────────────────────

export async function addMember(actorUserId, actorRole, orgId, { userId, role }) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);
  if (!["ADMIN", "COACH"].includes(role)) throw new AppError(400, "role must be ADMIN or COACH");
  const targetUser = await userRepository.findByIdBasic(userId);
  if (!targetUser) throw new AppError(404, "User not found");

  const existing = await orgRepository.findMembership(userId, orgId);
  if (existing) throw new AppError(409, "This user is already a member of this gym");

  const membership = await orgRepository.createMembership({ userId, organizationId: orgId, role });

  // If they have a CoachProfile, attach it to the org too, so
  // org-scoped client/billing queries pick them up automatically -
  // membership alone isn't enough, the CoachProfile needs the
  // organizationId set directly (see schema comment on why it's
  // duplicated rather than always joined through membership).
  const coachProfile = await orgRepository.findCoachProfileByUserId(userId);
  if (coachProfile) await orgRepository.setCoachOrganization(coachProfile.id, orgId);

  return membership;
}

export async function removeMember(actorUserId, actorRole, orgId, targetUserId) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);
  const membership = await orgRepository.findMembership(targetUserId, orgId);
  if (!membership) throw new AppError(404, "This user is not a member of this gym");

  await orgRepository.deleteMembership(targetUserId, orgId);

  // Detach their CoachProfile from the org too (SetNull, not delete -
  // they keep their account and history, just stop being gym-affiliated).
  const coachProfile = await orgRepository.findCoachProfileByUserId(targetUserId);
  if (coachProfile && coachProfile.organizationId === orgId) {
    await orgRepository.setCoachOrganization(coachProfile.id, null);
  }
  return { message: "Removed from gym" };
}

export async function listMembers(actorUserId, actorRole, orgId) {
  await requireOrgMember(actorUserId, actorRole, orgId);
  return orgRepository.findMembersForOrg(orgId);
}

// ── Org-scoped clients & coaches ────────────────────────────────────────

export async function listOrgCoaches(actorUserId, actorRole, orgId) {
  await requireOrgMember(actorUserId, actorRole, orgId);
  return orgRepository.findCoachesForOrg(orgId);
}

export async function listOrgClients(actorUserId, actorRole, orgId) {
  await requireOrgAdmin(actorUserId, actorRole, orgId); // full client list is an admin view, not every coach's - individual coaches see their own mapped roster via the existing /clients endpoint instead
  return orgRepository.findClientsForOrg(orgId);
}

// Admin assigns a coach to a client, within their own gym only. Reuses
// the existing ClientCoach table exactly as-is - this is the same
// mapping mechanism solo coaches already use, just created by an admin
// on the coach's behalf instead of the coach adding their own client.
export async function assignCoachToClient(actorUserId, actorRole, orgId, { clientId, coachId, coachingType }) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);

  const client = await orgRepository.findClientProfileById(clientId);
  if (!client || client.organizationId !== orgId) throw new AppError(404, "Client not found in this gym");

  const orgCoaches = await orgRepository.findCoachesForOrg(orgId);
  const coach = orgCoaches.find(c => c.id === coachId);
  if (!coach) throw new AppError(404, "Coach not found in this gym");

  const type = coachingType || "training";
  const existing = await orgRepository.findClientCoachMapping(clientId, coachId, type);
  if (existing && existing.status === "active") throw new AppError(409, "This coach is already mapped to this client");

  return orgRepository.createClientCoachMapping({ clientId, coachId, coachingType: type, status: "active" });
}

export async function unassignCoachFromClient(actorUserId, actorRole, orgId, { clientId, coachId, coachingType }) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);
  const client = await orgRepository.findClientProfileById(clientId);
  if (!client || client.organizationId !== orgId) throw new AppError(404, "Client not found in this gym");

  const type = coachingType || "training";
  const mapping = await orgRepository.findClientCoachMapping(clientId, coachId, type);
  if (!mapping || mapping.status !== "active") throw new AppError(404, "No active mapping found");
  return orgRepository.endClientCoachMapping(mapping.id);
}

export async function listClientCoaches(actorUserId, actorRole, orgId, clientId) {
  await requireOrgMember(actorUserId, actorRole, orgId);
  const client = await orgRepository.findClientProfileById(clientId);
  if (!client || client.organizationId !== orgId) throw new AppError(404, "Client not found in this gym");
  return orgRepository.findMappingsForClient(clientId);
}

// Moves an existing independent client into a gym - assigning them a
// coach still requires the separate assignCoachToClient call above,
// this just establishes tenant ownership.
export async function addExistingClientToOrg(actorUserId, actorRole, orgId, clientId) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);
  const client = await orgRepository.findClientProfileById(clientId);
  if (!client) throw new AppError(404, "Client not found");
  if (client.organizationId && client.organizationId !== orgId) throw new AppError(409, "This client already belongs to a different gym");

  const org = await orgRepository.findById(orgId);
  const currentCount = await orgRepository.countClientsForOrg(orgId);
  if (currentCount >= org.maxClients) throw new AppError(403, `This gym's plan allows ${org.maxClients} clients. Upgrade to add more.`);

  return orgRepository.setClientOrganization(client.id, orgId);
}
