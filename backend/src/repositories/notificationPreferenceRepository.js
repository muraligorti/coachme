// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCE REPOSITORY — pure Prisma data access. The
// actual "does this need a reminder right now" time-window logic lives
// in the service layer, operating on what these functions fetch — given
// this app's scale, fetching all enabled preferences and filtering in
// JS is simpler and plenty fast, rather than fighting Prisma to express
// "is this HH:MM string within 15 minutes of now" as a native filter.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findByUserId = (userId, client = prisma) =>
  client.notificationPreference.findUnique({ where: { userId } });

export const upsertPreference = (userId, data, client = prisma) =>
  client.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

// Every enabled preference row for one reminder type — the service layer
// checks each one's configured time against "now" and whether it's
// already fired today.
export const findEnabledForType = (type, client = prisma) =>
  client.notificationPreference.findMany({
    where: { [`${type}ReminderEnabled`]: true },
    include: { user: { select: { id: true, role: true } } },
  });

export const markDailyReminderSent = (userId, type, dateStr, client = prisma) =>
  client.notificationPreference.update({ where: { userId }, data: { [`last${type[0].toUpperCase()}${type.slice(1)}ReminderDate`]: dateStr } });

// Confirmed, future bookings where at least one side's reminder hasn't
// been sent yet — the service layer narrows further by each side's
// actual configured lead time.
export const findBookingsPendingReminder = (now, client = prisma) =>
  client.booking.findMany({
    where: {
      status: "CONFIRMED",
      scheduledAt: { gt: now },
      OR: [{ clientReminderSentAt: null }, { coachReminderSentAt: null }],
    },
    include: {
      client: { select: { id: true, userId: true, displayName: true } },
      coach: { select: { id: true, userId: true, displayName: true } },
    },
  });

export const markClientReminderSent = (bookingId, client = prisma) =>
  client.booking.update({ where: { id: bookingId }, data: { clientReminderSentAt: new Date() } });

export const markCoachReminderSent = (bookingId, client = prisma) =>
  client.booking.update({ where: { id: bookingId }, data: { coachReminderSentAt: new Date() } });
