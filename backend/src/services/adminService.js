// ═══════════════════════════════════════════════════════════════════════
// ADMIN SERVICE — the business rules for platform administration. This
// is deliberately conservative: an admin can change role/active-status,
// but a handful of safety guards prevent an admin from locking themselves
// out or silently orphaning a coach's clients.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as adminRepository from "../repositories/adminRepository.js";
import * as tokenService from "./tokenService.js";
import { getConfig, setConfig, getAllConfig } from "../lib/systemConfig.js";

const VALID_ROLES = ["ADMIN", "COACH", "CLIENT"];
const EDITABLE_FIELDS = ["role", "isActive", "emailVerified", "email"];
const VALID_TIERS = ["FREE", "STARTER", "PRO", "ELITE", "PREMIUM"];

export async function listUsers({ role, search, isActive, page, pageSize }) {
  page = Math.max(1, parseInt(page) || 1);
  pageSize = Math.min(100, Math.max(1, parseInt(pageSize) || 25));
  if (role && !VALID_ROLES.includes(role)) throw new AppError(400, `Invalid role filter: ${role}`);

  const filters = { role, search, isActive: isActive === undefined ? undefined : isActive === "true" || isActive === true, page, pageSize };
  const [users, total] = await Promise.all([adminRepository.findUsers(filters), adminRepository.countUsers(filters)]);

  const shaped = users.map((u) => ({
    id: u.id, email: u.email, role: u.role, isActive: u.isActive, emailVerified: u.emailVerified,
    lastLogin: u.lastLogin, createdAt: u.createdAt, avatarUrl: u.avatarUrl,
    displayName: u.coachProfile?.displayName || u.clientProfile?.displayName || u.email.split("@")[0],
    tier: u.subscription?.tier || null, maxClients: u.subscription?.maxClients || null,
  }));

  return { users: shaped, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export async function getUserDetail(id) {
  const user = await adminRepository.findUserById(id);
  if (!user) throw new AppError(404, "User not found");
  return user;
}

export async function updateUser(adminUserId, targetUserId, changes) {
  const unknownFields = Object.keys(changes).filter((k) => !EDITABLE_FIELDS.includes(k));
  if (unknownFields.length) throw new AppError(400, `These fields cannot be edited here: ${unknownFields.join(", ")}`);

  const target = await adminRepository.findUserById(targetUserId);
  if (!target) throw new AppError(404, "User not found");

  // Safety guard: an admin can't demote or deactivate their own account —
  // prevents accidentally locking every admin out of the platform.
  if (targetUserId === adminUserId) {
    if (changes.role && changes.role !== "ADMIN") throw new AppError(400, "You cannot change your own role away from ADMIN");
    if (changes.isActive === false) throw new AppError(400, "You cannot deactivate your own account");
  }

  if (changes.role && !VALID_ROLES.includes(changes.role)) throw new AppError(400, `Invalid role: ${changes.role}`);

  if (changes.email) {
    const cleanEmail = changes.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new AppError(400, "Invalid email address");
    const taken = await adminRepository.findByEmailExcluding(cleanEmail, targetUserId);
    if (taken) throw new AppError(409, "Another account already uses this email");
    changes.email = cleanEmail;
  }

  // Warn-and-block (not silently orphan) if deactivating a coach who still has active clients.
  if (changes.isActive === false && target.role === "COACH" && target.coachProfile) {
    const activeClients = await adminRepository.countActiveClientsForCoach(target.coachProfile.id);
    if (activeClients > 0 && !changes.confirmDespiteActiveClients) {
      throw new AppError(409, `This coach has ${activeClients} active client(s). Their upcoming bookings will be orphaned. Confirm to proceed anyway.`, { activeClients, requiresConfirmation: true });
    }
  }
  delete changes.confirmDespiteActiveClients;

  const updated = await adminRepository.updateUser(targetUserId, changes);

  // Deactivating or changing role should force the user to re-authenticate
  // under their new state, not keep operating on a stale session.
  if (changes.isActive === false || changes.role) {
    await adminRepository.deleteAllSessionsForUser(targetUserId);
  }

  await adminRepository.createAuditEntry({
    userId: adminUserId, action: "admin_update_user", resource: "user", resourceId: targetUserId,
    details: { changes, targetEmail: target.email },
  });

  return updated;
}

export async function setUserTier(adminUserId, targetUserId, tier) {
  if (!VALID_TIERS.includes(tier)) throw new AppError(400, `Invalid tier: ${tier}. Must be one of ${VALID_TIERS.join(", ")}`);
  const target = await adminRepository.findUserById(targetUserId);
  if (!target) throw new AppError(404, "User not found");
  if (target.role !== "COACH") throw new AppError(400, "Only coach accounts have a subscription tier");

  const tierFeatures = await getConfig("tierFeatures");
  const updated = await adminRepository.updateSubscriptionTier(targetUserId, tier, tierFeatures[tier]?.maxClients ?? 5);
  await adminRepository.createAuditEntry({
    userId: adminUserId, action: "admin_set_tier", resource: "subscription", resourceId: targetUserId,
    details: { tier, targetEmail: target.email },
  });
  return updated;
}

export async function updateUserPhone(adminUserId, targetUserId, phone) {
  const target = await adminRepository.findUserById(targetUserId);
  if (!target) throw new AppError(404, "User not found");
  if (target.role === "COACH" && target.coachProfile) {
    await adminRepository.updateCoachPhone(target.coachProfile.id, phone);
  } else if (target.role === "CLIENT" && target.clientProfile) {
    await adminRepository.updateClientPhone(target.clientProfile.id, phone);
  } else {
    throw new AppError(400, "This account has no coach or client profile to attach a phone number to");
  }
  await adminRepository.createAuditEntry({
    userId: adminUserId, action: "admin_update_phone", resource: "user", resourceId: targetUserId,
    details: { targetEmail: target.email },
  });
  return adminRepository.findUserById(targetUserId);
}

// Genuinely destructive and irreversible - cascade relationships
// throughout the schema mean this removes everything tied to the
// account (profile, bookings, workouts, check-ins, sessions, invoices,
// etc.), not just the login. Same safety guards as deactivation
// (can't target yourself, warns before orphaning a coach's active
// clients) plus an explicit confirmation requirement the frontend must
// satisfy.
export async function deleteUser(adminUserId, targetUserId, confirmDespiteActiveClients) {
  if (targetUserId === adminUserId) throw new AppError(400, "You cannot delete your own account");

  const target = await adminRepository.findUserById(targetUserId);
  if (!target) throw new AppError(404, "User not found");

  if (target.role === "COACH" && target.coachProfile) {
    const activeClients = await adminRepository.countActiveClientsForCoach(target.coachProfile.id);
    if (activeClients > 0 && !confirmDespiteActiveClients) {
      throw new AppError(409, `This coach has ${activeClients} active client(s). Deleting permanently removes their bookings, workout plans, and history too. Confirm to proceed anyway.`, { activeClients, requiresConfirmation: true });
    }
  }

  await adminRepository.createAuditEntry({
    userId: adminUserId, action: "admin_delete_user", resource: "user", resourceId: targetUserId,
    details: { targetEmail: target.email, targetRole: target.role },
  });
  await adminRepository.deleteUserById(targetUserId);
  return { message: `${target.email} and all associated data have been permanently deleted.` };
}

// Rather than duplicating every coach/client feature into bespoke admin
// UI (which would need to stay in sync with every future feature
// forever), admin can generate a real, valid session for a specific
// coach or client and use the actual app as they would - covering
// everything, automatically, as features get added. Deliberately
// restricted: never targets another admin (keeps the blast radius of a
// compromised admin account bounded), always audit-logged clearly since
// this is genuinely sensitive, and the admin's own session is untouched
// server-side - the frontend is responsible for holding onto it so
// "stop impersonating" can restore it without a fresh login.
export async function impersonateUser(adminUserId, targetUserId, requestMeta) {
  if (targetUserId === adminUserId) throw new AppError(400, "You cannot impersonate your own account");

  const target = await adminRepository.findUserById(targetUserId);
  if (!target) throw new AppError(404, "User not found");
  if (target.role === "ADMIN") throw new AppError(403, "Cannot impersonate another admin account");
  if (!target.isActive) throw new AppError(400, "Cannot impersonate a deactivated account");

  const tokens = tokenService.generateTokens(target);
  await tokenService.createSession(target, tokens, requestMeta);

  await adminRepository.createAuditEntry({
    userId: adminUserId, action: "admin_impersonate_start", resource: "user", resourceId: targetUserId,
    details: { targetEmail: target.email, targetRole: target.role },
  });

  return {
    user: { id: target.id, email: target.email, role: target.role },
    accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
  };
}

// ─── System Config (previously hardcoded, now admin-editable) ────────

export async function getSystemConfig() {
  return getAllConfig();
}

export async function updateSystemConfig(adminUserId, key, value) {
  if (key === "tierFeatures") {
    if (typeof value !== "object" || value === null) throw new AppError(400, "tierFeatures must be an object keyed by tier");
    for (const [tier, features] of Object.entries(value)) {
      if (!VALID_TIERS.includes(tier)) throw new AppError(400, `Invalid tier in tierFeatures: ${tier}`);
      if (typeof features.maxClients !== "number" || features.maxClients < 1) throw new AppError(400, `${tier}.maxClients must be a positive number`);
    }
  } else if (key === "specializations") {
    if (!Array.isArray(value) || value.some(s => !s.v || !s.l)) throw new AppError(400, "specializations must be an array of {v, l} objects");
  }
  const updated = await setConfig(key, value, adminUserId);
  await adminRepository.createAuditEntry({
    userId: adminUserId, action: "admin_update_config", resource: "system_config", resourceId: key,
    details: { key },
  });
  return updated;
}

export async function forceLogout(adminUserId, targetUserId) {
  const target = await adminRepository.findUserById(targetUserId);
  if (!target) throw new AppError(404, "User not found");
  await adminRepository.deleteAllSessionsForUser(targetUserId);
  await adminRepository.createAuditEntry({ userId: adminUserId, action: "admin_force_logout", resource: "user", resourceId: targetUserId, details: { targetEmail: target.email } });
  return { message: `${target.email} has been signed out of all devices.` };
}

export async function getAuditLog({ userId, action, resource, page, pageSize }) {
  page = Math.max(1, parseInt(page) || 1);
  pageSize = Math.min(200, Math.max(1, parseInt(pageSize) || 50));
  const filters = { userId, action, resource, page, pageSize };
  const [entries, total] = await Promise.all([adminRepository.findAuditLog(filters), adminRepository.countAuditLog(filters)]);
  return { entries, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
