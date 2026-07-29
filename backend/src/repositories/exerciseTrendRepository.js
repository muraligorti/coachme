// ═══════════════════════════════════════════════════════════════════════
// EXERCISE TREND REPOSITORY — pure Prisma data access. Mounted as its
// own additive module (see routes/exerciseTrends.js) rather than folded
// into whatever the existing workouts.js file does, for the same reason
// as booking-requests: I don't have visibility into that live file after
// the sandbox resets this session, so this stays isolated and safe.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId } });

export const findClientProfileByUserId = (userId, client = prisma) =>
  client.clientProfile.findUnique({ where: { userId } });

export const findActiveRelationship = (coachId, clientId, client = prisma) =>
  client.clientCoach.findFirst({ where: { coachId, clientId, status: "active" } });

// Every distinct exercise name this client has ever logged — powers the
// "pick an exercise" selector for the trend chart.
export const findDistinctExerciseNames = (clientId, client = prisma) =>
  client.workoutSession.findMany({
    where: { clientId }, distinct: ["exerciseName"], select: { exerciseName: true }, orderBy: { exerciseName: "asc" },
  });

// Full history for one exercise, oldest first (natural order for a trend line).
export const findExerciseHistory = (clientId, exerciseName, client = prisma) =>
  client.workoutSession.findMany({
    where: { clientId, exerciseName }, orderBy: { completedAt: "asc" },
  });

// The single most recent prior session for an exercise, as of a given
// cutoff time — used to compute the "vs last time" comparison right
// after a new live session is logged (deterministic math, not an AI
// guess — see the service layer for why).
export const findLastSessionBefore = (clientId, exerciseName, beforeDate, client = prisma) =>
  client.workoutSession.findFirst({
    where: { clientId, exerciseName, completedAt: { lt: beforeDate } }, orderBy: { completedAt: "desc" },
  });

// Sets quality/form data on an ALREADY-CREATED session — kept separate
// from creation since this module doesn't touch the existing (and
// currently invisible-to-me) POST /workouts/sessions endpoint at all.
export const findSessionById = (id, client = prisma) => client.workoutSession.findUnique({ where: { id } });

export const setQualityAndFormNotes = (id, formScore, formNotes, client = prisma) =>
  client.workoutSession.update({ where: { id }, data: { formScore, formNotes } });
