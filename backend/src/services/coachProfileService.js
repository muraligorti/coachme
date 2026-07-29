// ═══════════════════════════════════════════════════════════════════════
// COACH PROFILE SERVICE — a coach sets their own specialization (Yoga,
// Pilates, Strength, etc.) at signup or later in Settings; tier is
// visible here but never settable by the coach themselves — only an
// admin can change it (see adminService.setUserTier).
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as repo from "../repositories/coachProfileRepository.js";

const VALID_SPECIALIZATIONS = ["yoga", "pilates", "strength", "crossfit", "general"];

export async function getMyProfile(userId) {
  const [coach, subscription] = await Promise.all([
    repo.findCoachProfileByUserId(userId),
    repo.findSubscriptionByUserId(userId),
  ]);
  if (!coach) throw new AppError(403, "Only coaches have this profile info");
  return {
    specializations: coach.specializations || [],
    tier: subscription?.tier || "FREE",
    maxClients: subscription?.maxClients || 5,
  };
}

export async function setMySpecializations(userId, specializations) {
  if (!Array.isArray(specializations)) throw new AppError(400, "specializations must be an array");
  const invalid = specializations.filter((s) => !VALID_SPECIALIZATIONS.includes(s));
  if (invalid.length) throw new AppError(400, `Unknown specialization(s): ${invalid.join(", ")}. Valid options: ${VALID_SPECIALIZATIONS.join(", ")}`);
  const coach = await repo.findCoachProfileByUserId(userId);
  if (!coach) throw new AppError(403, "Only coaches can set a specialization");
  await repo.updateSpecializations(userId, specializations);
  return { specializations };
}

export { VALID_SPECIALIZATIONS };
