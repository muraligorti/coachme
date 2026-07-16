// ═══════════════════════════════════════════════════════════════════════
// CLIENT-COACH REPOSITORY — pure Prisma data access for the ClientCoach
// join table. Used by insightsService to know which clients belong to
// which coach before computing any risk signals.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findActiveClientsForCoach = (coachId, client = prisma) =>
  client.clientCoach.findMany({
    where: { coachId, status: "active" },
    include: { client: { select: { id: true, displayName: true, avatar: true } } },
  });
