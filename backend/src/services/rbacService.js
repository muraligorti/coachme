// ═══════════════════════════════════════════════════════════════════════
// RBAC SERVICE — defines which optional features exist per role, and
// resolves a coach/client's EFFECTIVE visibility (defaults merged with
// any admin override). Default is always "visible" — an admin can only
// hide things, never needs to explicitly enable everything for every
// new account (backward-compatible with every existing user).
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as repo from "../repositories/rbacRepository.js";

// The optional, admin-toggleable features per role. Core navigation
// (Home, Schedule, Clients for a coach; Schedule for a client) is never
// in this list — an admin restricting access shouldn't be able to lock
// someone out of the app entirely, only hide optional/secondary tools.
export const COACH_FEATURE_KEYS = {
  leads: "Leads Pipeline", mealplan: "AI Meal Planner", checkins: "Check-ins (coach view)",
  reports: "Analytics", invoices: "Invoices", ai: "AI Coach Assistant", media: "Media Library",
  insightSettings: "AI Insights Settings",
};
export const CLIENT_FEATURE_KEYS = {
  nutrition: "Nutrition Tracker", checkins: "Check-ins", habits: "Habits",
  devices: "Fitness Devices", photos: "Progress Photos",
};

function effectiveFlags(keys, stored) {
  const flags = {};
  for (const key of Object.keys(keys)) flags[key] = stored?.[key] !== false; // default true unless explicitly disabled
  return flags;
}

export async function getMyFeatures(userId, role) {
  if (role === "COACH") {
    const profile = await repo.findCoachProfileByUserId(userId);
    return { flags: effectiveFlags(COACH_FEATURE_KEYS, profile?.featureFlags), category: profile?.category || null };
  }
  if (role === "CLIENT") {
    const profile = await repo.findClientProfileByUserId(userId);
    return { flags: effectiveFlags(CLIENT_FEATURE_KEYS, profile?.featureFlags), category: profile?.category || null };
  }
  return { flags: {}, category: null };
}

export async function getUserFeatures(targetUserId) {
  const user = await repo.findUserWithProfiles(targetUserId);
  if (!user) throw new AppError(404, "User not found");
  if (user.role === "COACH" && user.coachProfile) {
    return { availableKeys: COACH_FEATURE_KEYS, flags: effectiveFlags(COACH_FEATURE_KEYS, user.coachProfile.featureFlags), category: user.coachProfile.category || "" };
  }
  if (user.role === "CLIENT" && user.clientProfile) {
    return { availableKeys: CLIENT_FEATURE_KEYS, flags: effectiveFlags(CLIENT_FEATURE_KEYS, user.clientProfile.featureFlags), category: user.clientProfile.category || "" };
  }
  return { availableKeys: {}, flags: {}, category: "" };
}

export async function setUserFeatureFlags(targetUserId, updates) {
  const user = await repo.findUserWithProfiles(targetUserId);
  if (!user) throw new AppError(404, "User not found");
  const keys = user.role === "COACH" ? COACH_FEATURE_KEYS : user.role === "CLIENT" ? CLIENT_FEATURE_KEYS : null;
  if (!keys) throw new AppError(400, "Feature flags only apply to COACH or CLIENT accounts");
  const unknown = Object.keys(updates).filter((k) => !(k in keys));
  if (unknown.length) throw new AppError(400, `Unknown feature key(s): ${unknown.join(", ")}`);

  if (user.role === "COACH") {
    const merged = { ...(user.coachProfile.featureFlags || {}), ...updates };
    await repo.updateCoachFeatureFlags(user.coachProfile.id, merged);
  } else {
    const merged = { ...(user.clientProfile.featureFlags || {}), ...updates };
    await repo.updateClientFeatureFlags(user.clientProfile.id, merged);
  }
  return getUserFeatures(targetUserId);
}

export async function setUserCategory(targetUserId, category) {
  const user = await repo.findUserWithProfiles(targetUserId);
  if (!user) throw new AppError(404, "User not found");
  if (user.role === "COACH" && user.coachProfile) await repo.updateCoachCategory(user.coachProfile.id, category || null);
  else if (user.role === "CLIENT" && user.clientProfile) await repo.updateClientCategory(user.clientProfile.id, category || null);
  else throw new AppError(400, "Category only applies to COACH or CLIENT accounts");
  return getUserFeatures(targetUserId);
}
