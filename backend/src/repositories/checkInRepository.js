// ═══════════════════════════════════════════════════════════════════════
// CHECK-IN REPOSITORY — pure Prisma data access. One check-in per
// client per day (unique on clientId+date) — submitting again on the
// same day updates rather than creates a duplicate.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const upsertCheckIn = (clientId, date, data, client = prisma) =>
  client.checkIn.upsert({
    where: { clientId_date: { clientId, date } },
    create: { clientId, date, ...data },
    update: data,
  });

export const findForClient = (clientId, { limit = 60 } = {}, client = prisma) =>
  client.checkIn.findMany({ where: { clientId }, orderBy: { date: "desc" }, take: limit });

export const findLatestForClient = (clientId, client = prisma) =>
  client.checkIn.findFirst({ where: { clientId }, orderBy: { date: "desc" } });

// Used by insightsService-style risk detection later if wanted — kept
// here now so the repository is complete even if not yet wired in.
export const countRecentForClient = (clientId, sinceDate, client = prisma) =>
  client.checkIn.count({ where: { clientId, date: { gte: sinceDate } } });

// ── Cross-domain lookups this feature's services need ──────────────────
// (Coach/Client profile + relationship checks — kept here rather than a
// separate file since check-ins and habits are the only two callers.)
export const findCoachProfileByUserId = (userId, client = prisma) =>
  client.coachProfile.findUnique({ where: { userId } });

export const findClientProfileByUserId = (userId, client = prisma) =>
  client.clientProfile.findUnique({ where: { userId } });

export const findActiveCoachClientRelationship = (coachId, clientId, client = prisma) =>
  client.clientCoach.findFirst({ where: { coachId, clientId, status: "active" } });
