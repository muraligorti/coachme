// ═══════════════════════════════════════════════════════════════════════
// CHECK-IN SERVICE — a client submits their own check-ins; a coach may
// VIEW (never edit) a check-in history, but only for a client they
// actually have an active coaching relationship with — this is the
// security boundary that makes coach-visibility safe to add at all.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as checkInRepository from "../repositories/checkInRepository.js";

const MOOD_VALUES = ["great", "good", "okay", "tired", "bad"];

// Shared security check — a coach can only view a client who is actually
// on their active roster. Exported since habitService uses the identical rule.
export async function verifyCoachHasClient(coachUserId, clientId) {
  const coachProfile = await checkInRepository.findCoachProfileByUserId(coachUserId);
  if (!coachProfile) throw new AppError(403, "Only coaches can view client data this way");
  const rel = await checkInRepository.findActiveCoachClientRelationship(coachProfile.id, clientId);
  if (!rel) throw new AppError(403, "This client is not on your roster");
}

async function getOwnClientProfileId(userId) {
  const profile = await checkInRepository.findClientProfileByUserId(userId);
  if (!profile) throw new AppError(403, "Only clients can submit check-ins");
  return profile.id;
}

export async function submitCheckIn(userId, data) {
  const clientId = await getOwnClientProfileId(userId);
  if (data.mood && !MOOD_VALUES.includes(data.mood)) throw new AppError(400, `mood must be one of: ${MOOD_VALUES.join(", ")}`);
  for (const f of ["energy", "sleep", "stress"]) {
    if (data[f] !== undefined && (data[f] < 1 || data[f] > 10)) throw new AppError(400, `${f} must be between 1 and 10`);
  }
  if (data.adherence !== undefined && (data.adherence < 0 || data.adherence > 100)) throw new AppError(400, "adherence must be between 0 and 100");

  const date = data.date || new Date().toISOString().slice(0, 10);
  return checkInRepository.upsertCheckIn(clientId, date, {
    mood: data.mood, energy: data.energy, sleep: data.sleep, stress: data.stress,
    adherence: data.adherence, weight: data.weight, notes: data.notes,
  });
}

export async function getOwnCheckIns(userId) {
  const clientId = await getOwnClientProfileId(userId);
  return checkInRepository.findForClient(clientId);
}

export async function getClientCheckIns(coachUserId, clientId) {
  await verifyCoachHasClient(coachUserId, clientId);
  return checkInRepository.findForClient(clientId);
}
