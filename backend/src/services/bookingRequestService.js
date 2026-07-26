// ═══════════════════════════════════════════════════════════════════════
// BOOKING REQUEST SERVICE — a client checks a coach's availability, then
// requests a slot. The request always lands as PENDING — the coach's
// existing accept/reject mechanism (already built into BookingsPage's
// Confirm/Cancel quick-actions, via the existing PATCH /bookings/:id
// route) is what actually accepts or rejects it. This service doesn't
// duplicate that — it only handles the client-side half: checking
// availability and creating the request safely.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as repo from "../repositories/bookingRequestRepository.js";

async function resolveClientAndVerifyRelationship(userId, coachId) {
  const clientProfile = await repo.findClientProfileByUserId(userId);
  if (!clientProfile) throw new AppError(403, "Only clients can request sessions");
  const coach = await repo.findCoachProfileById(coachId);
  if (!coach) throw new AppError(404, "Coach not found");
  const rel = await repo.findActiveRelationship(coachId, clientProfile.id);
  if (!rel) throw new AppError(403, "You can only request sessions with your own coach");
  return clientProfile;
}

// Returns busy blocks for the day — client-safe (start/end only, no
// other client's identity), used to render a slot picker that visually
// disables times that are already taken.
export async function getCoachAvailability(userId, coachId, dateStr) {
  await resolveClientAndVerifyRelationship(userId, coachId);
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new AppError(400, "date must be in YYYY-MM-DD format");

  const dayStart = new Date(dateStr + "T00:00:00");
  const dayEnd = new Date(dateStr + "T23:59:59.999");
  const busy = await repo.findBusyBlocksForCoach(coachId, dayStart, dayEnd);

  return busy.map((b) => {
    const start = new Date(b.scheduledAt);
    const end = new Date(start.getTime() + (b.durationMinutes || 60) * 60000);
    return { start: start.toISOString(), end: end.toISOString() };
  });
}

// A client's own list of active coaches, to populate "which coach am I
// requesting a session with?" — usually just one, but the data model
// (and multi-coach clients) supports more.
export async function getMyCoaches(userId) {
  const clientProfile = await repo.findClientProfileByUserId(userId);
  if (!clientProfile) throw new AppError(403, "Only clients have a coach list");
  const rels = await repo.findMyCoaches(clientProfile.id);
  return rels.map((r) => ({ id: r.coach.id, displayName: r.coach.displayName, sessionTypes: r.coach.sessionTypes }));
}

export async function requestSession(userId, { coachId, scheduledAt, durationMinutes, sessionType, notes }) {
  if (!coachId || !scheduledAt) throw new AppError(400, "coachId and scheduledAt are required");
  const duration = durationMinutes || 60;
  if (new Date(scheduledAt) <= new Date()) throw new AppError(400, "Requested time must be in the future");

  const clientProfile = await resolveClientAndVerifyRelationship(userId, coachId);

  // Real, server-side conflict check — the availability endpoint is a
  // convenience for the UI, this is the actual guarantee against a race
  // (two people requesting the same slot at nearly the same moment).
  const conflict = await repo.findConflictingBooking(coachId, scheduledAt, duration);
  if (conflict) throw new AppError(409, "That slot is no longer available — please pick a different time.");

  return repo.createBookingRequest({
    clientId: clientProfile.id, coachId, scheduledAt: new Date(scheduledAt), durationMinutes: duration,
    sessionType: sessionType || "ONLINE", notes: notes || null, status: "PENDING", initiatedBy: "client",
  });
}
