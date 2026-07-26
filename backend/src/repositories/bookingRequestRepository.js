// ═══════════════════════════════════════════════════════════════════════
// BOOKING REQUEST REPOSITORY — pure Prisma data access supporting the
// client-request-a-slot flow. Deliberately separate from whatever
// repository backs the existing coach-facing bookings.js routes, so this
// feature can be added without touching that file at all.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findCoachProfileById = (coachId, client = prisma) =>
  client.coachProfile.findUnique({ where: { id: coachId } });

export const findClientProfileByUserId = (userId, client = prisma) =>
  client.clientProfile.findUnique({ where: { userId } });

export const findActiveRelationship = (coachId, clientId, client = prisma) =>
  client.clientCoach.findFirst({ where: { coachId, clientId, status: "active" } });

// Busy blocks for a coach on a given day — deliberately returns ONLY
// timing, never client names/emails, since this is read by a CLIENT
// checking their coach's calendar and must never leak another client's
// identity.
export const findBusyBlocksForCoach = (coachId, dayStart, dayEnd, client = prisma) =>
  client.booking.findMany({
    where: { coachId, scheduledAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ["CANCELLED"] } },
    select: { scheduledAt: true, durationMinutes: true },
  });

// Real conflict check at write-time — never trust the client-side slot
// picker alone, since two people could race for the same slot. Pulls
// that day's non-cancelled bookings for the coach and checks for actual
// time-range overlap in JS (Prisma can't cleanly express "existing.start
// + existing.duration > newStart" as a single native query).
export const findConflictingBooking = async (coachId, scheduledAt, durationMinutes, client = prisma) => {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);

  const sameDay = await client.booking.findMany({
    where: { coachId, status: { notIn: ["CANCELLED"] }, scheduledAt: { gte: dayStart, lte: dayEnd } },
    select: { scheduledAt: true, durationMinutes: true },
  });

  return sameDay.find((b) => {
    const bStart = new Date(b.scheduledAt);
    const bEnd = new Date(bStart.getTime() + (b.durationMinutes || 60) * 60000);
    return bStart < end && bEnd > start; // standard interval-overlap test
  }) || null;
};

export const createBookingRequest = (data, client = prisma) => client.booking.create({ data });

// A client's own active coach relationships, with just enough coach
// profile info to populate a "which coach am I requesting?" selector.
export const findMyCoaches = (clientId, client = prisma) =>
  client.clientCoach.findMany({
    where: { clientId, status: "active" },
    include: { coach: { select: { id: true, displayName: true, sessionTypes: true } } },
  });
