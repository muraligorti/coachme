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
import * as profileRepository from "../repositories/profileRepository.js";
import { runTransaction } from "../repositories/transactionManager.js";

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

// Creates a genuinely new coach account as a gym employee - not a
// search-and-attach of some existing user. This is the actual fix for
// the mess the previous search-based addMember caused: a gym coach
// created this way is complete (real CoachProfile, real membership,
// organizationId set) from the moment they exist, never a half-state
// discovered later via a confusing error. Uses the same PENDING_INVITE
// pattern the existing solo-coach "add client" flow already relies on -
// the account exists and can be used to log in once they set a password
// via the normal forgot-password flow, or a dedicated invite flow later.
export async function createGymCoach(actorUserId, actorRole, orgId, { name, email, phone, city, country, specializations }) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);
  if (!name?.trim()) throw new AppError(400, "Coach name is required");
  if (!email?.trim()) throw new AppError(400, "Coach email is required");

  const org = await orgRepository.findById(orgId);
  if (!org) throw new AppError(404, "Gym not found");

  const cleanEmail = email.trim().toLowerCase();
  const existingUser = await userRepository.findByEmail(cleanEmail);
  if (existingUser) throw new AppError(409, "An account with this email already exists - this flow is only for genuinely new gym coaches");

  return runTransaction(async (tx) => {
    const user = await userRepository.create({ email: cleanEmail, passwordHash: "PENDING_INVITE", role: "COACH" }, tx);
    const coachProfile = await profileRepository.createCoachProfile({
      userId: user.id, organizationId: orgId, displayName: name.trim(), phone: phone || null,
      city: city || org.city || "", country: country || org.country || "",
      specializations: specializations || [], certifications: [], languages: [],
    }, tx);
    const membership = await orgRepository.createMembership({ userId: user.id, organizationId: orgId, role: "COACH" }, tx);
    return { user: { id: user.id, email: user.email }, coachProfile, membership };
  });
}

// Same principle for clients - created directly for the gym, never a
// pre-existing account being pulled in. Mirrors the solo-coach
// "POST /clients" invite pattern exactly, with organizationId set from
// the start instead of requiring a separate attach step.
export async function createGymClient(actorUserId, actorRole, orgId, { name, email, phone, age, gender, goals, notes }) {
  await requireOrgAdmin(actorUserId, actorRole, orgId);
  if (!name?.trim()) throw new AppError(400, "Client name is required");
  if (!email?.trim()) throw new AppError(400, "Client email is required");

  const org = await orgRepository.findById(orgId);
  if (!org) throw new AppError(404, "Gym not found");
  const currentCount = await orgRepository.countClientsForOrg(orgId);
  if (currentCount >= org.maxClients) throw new AppError(403, `This gym's plan allows ${org.maxClients} clients. Upgrade to add more.`);

  const cleanEmail = email.trim().toLowerCase();
  const existingUser = await userRepository.findByEmail(cleanEmail);
  if (existingUser) throw new AppError(409, "An account with this email already exists - this flow is only for genuinely new gym clients");

  return runTransaction(async (tx) => {
    const user = await userRepository.create({ email: cleanEmail, passwordHash: "PENDING_INVITE", role: "CLIENT" }, tx);
    const clientProfile = await profileRepository.createClientProfile({
      userId: user.id, organizationId: orgId, displayName: name.trim(), phone: phone || null,
      age: age ? parseInt(age) : null, gender: gender || null, notes: notes || null,
      fitnessGoals: goals ? (Array.isArray(goals) ? goals : [goals]) : [],
    }, tx);
    await profileRepository.createSubscription({ userId: user.id, tier: "FREE" }, tx);
    return { user: { id: user.id, email: user.email }, clientProfile };
  });
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

