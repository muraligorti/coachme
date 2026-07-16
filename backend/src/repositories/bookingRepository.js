// ═══════════════════════════════════════════════════════════════════════
// BOOKING REPOSITORY (insights-focused) — read-only queries used by
// insightsService to detect booking-cadence drop-off. This is a narrow,
// purpose-built repository, not a full refactor of routes/bookings.js —
// that route stays as-is for now (see Volume 3 ADR: migrate opportunistically,
// module by module, as each next receives significant new work).
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

// Count non-cancelled bookings for a client within a date range — used to
// compare a recent window against an earlier one to detect cadence drop.
export const countInRange = (clientId, start, end, client = prisma) =>
  client.booking.count({
    where: {
      clientId,
      scheduledAt: { gte: start, lt: end },
      status: { notIn: ["CANCELLED"] },
    },
  });

export const findLatestByClient = (clientId, client = prisma) =>
  client.booking.findFirst({
    where: { clientId, status: { notIn: ["CANCELLED"] } },
    orderBy: { scheduledAt: "desc" },
  });
