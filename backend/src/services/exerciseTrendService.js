// ═══════════════════════════════════════════════════════════════════════
// EXERCISE TREND SERVICE — a client sees their own progression; a coach
// sees a roster client's progression, gated by the same active-roster
// check used everywhere else this session (checkInService, habitService,
// bookingRequestService all share this exact pattern).
//
// DESIGN NOTE on "use AI where it helps, not everywhere": the "vs last
// time" comparison below is deterministic arithmetic (subtract two
// numbers), computed here in plain code. It would be strictly worse to
// route that through an AI call — slower, costs tokens, and language
// models are not the reliable way to do subtraction. AI's genuine value
// in this feature is extracting qualitative form/technique notes from a
// messy spoken transcript (that happens once, during the live-session
// parse itself — see LiveSessionPage's existing AI prompt) — that's a
// task AI is actually good at that plain code can't do at all.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as repo from "../repositories/exerciseTrendRepository.js";

async function verifyAccess(userId, clientId) {
  const clientProfile = await repo.findClientProfileByUserId(userId);
  if (clientProfile) {
    if (clientProfile.id !== clientId) throw new AppError(403, "You can only view your own trends");
    return;
  }
  const coachProfile = await repo.findCoachProfileByUserId(userId);
  if (!coachProfile) throw new AppError(403, "Not authorized");
  const rel = await repo.findActiveRelationship(coachProfile.id, clientId);
  if (!rel) throw new AppError(403, "This client is not on your roster");
}

// WorkoutSession stores weight as a freeform string in `intensity` (e.g.
// "60kg", "60 kg", "bodyweight") since a coach speaks naturally, not in a
// structured field. This pulls the leading number back out for charting;
// non-numeric values (like "bodyweight") just chart as null, not zero.
function parseWeight(intensity) {
  if (!intensity) return null;
  const match = String(intensity).match(/[\d.]+/);
  return match ? parseFloat(match[0]) : null;
}

function shapeSession(s) {
  return {
    id: s.id, date: s.completedAt, sets: s.sets, reps: s.reps,
    weight: parseWeight(s.intensity), weightLabel: s.intensity,
    formScore: s.formScore, formNotes: s.formNotes, notes: s.notes,
  };
}

export async function listOwnExerciseNames(userId) {
  const clientProfile = await repo.findClientProfileByUserId(userId);
  if (!clientProfile) throw new AppError(403, "Only clients have their own exercise trends");
  const rows = await repo.findDistinctExerciseNames(clientProfile.id);
  return rows.map((r) => r.exerciseName).filter(Boolean);
}

export async function getOwnExerciseHistory(userId, exerciseName) {
  const clientProfile = await repo.findClientProfileByUserId(userId);
  if (!clientProfile) throw new AppError(403, "Only clients have their own exercise trends");
  const rows = await repo.findExerciseHistory(clientProfile.id, exerciseName);
  return rows.map(shapeSession);
}

export async function listExerciseNames(userId, clientId) {
  await verifyAccess(userId, clientId);
  const rows = await repo.findDistinctExerciseNames(clientId);
  return rows.map((r) => r.exerciseName).filter(Boolean);
}

export async function getExerciseHistory(userId, clientId, exerciseName) {
  await verifyAccess(userId, clientId);
  const rows = await repo.findExerciseHistory(clientId, exerciseName);
  return rows.map(shapeSession);
}

// Deterministic comparison against the immediately preceding session for
// the same exercise — this is what powers the "vs last time: +5kg"
// inline note on the live-session review screen.
// Sets quality/form data on a session that was just created via the
// existing POST /workouts/sessions endpoint — a coach can only annotate
// sessions belonging to one of their own roster clients.
export async function setSessionQuality(userId, sessionId, { formScore, formNotes }) {
  const coachProfile = await repo.findCoachProfileByUserId(userId);
  if (!coachProfile) throw new AppError(403, "Only coaches can set quality ratings");
  const session = await repo.findSessionById(sessionId);
  if (!session) throw new AppError(404, "Workout session not found");
  const rel = await repo.findActiveRelationship(coachProfile.id, session.clientId);
  if (!rel) throw new AppError(403, "This client is not on your roster");
  if (formScore !== undefined && formScore !== null && (formScore < 1 || formScore > 4)) {
    throw new AppError(400, "formScore must be between 1 and 4");
  }
  return repo.setQualityAndFormNotes(sessionId, formScore ?? null, formNotes ?? null);
}

export async function compareToLastSession(userId, clientId, exerciseName, currentSession) {
  await verifyAccess(userId, clientId);
  const cutoff = currentSession.completedAt ? new Date(currentSession.completedAt) : new Date();
  const prior = await repo.findLastSessionBefore(clientId, exerciseName, cutoff);
  if (!prior) return { hasPrior: false };

  const priorWeight = parseWeight(prior.intensity);
  const currentWeight = parseWeight(currentSession.intensity);
  const weightDelta = priorWeight !== null && currentWeight !== null ? +(currentWeight - priorWeight).toFixed(1) : null;
  const repsDelta = prior.reps !== null && currentSession.reps !== null ? currentSession.reps - prior.reps : null;

  return {
    hasPrior: true,
    priorDate: prior.completedAt,
    weightDelta, repsDelta,
    priorWeight, currentWeight: currentWeight ?? null,
    priorReps: prior.reps, currentReps: currentSession.reps ?? null,
  };
}
