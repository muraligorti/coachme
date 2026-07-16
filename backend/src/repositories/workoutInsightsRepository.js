// ═══════════════════════════════════════════════════════════════════════
// WORKOUT REPOSITORY (insights-focused) — narrow, read-only query used by
// insightsService to detect workout-logging drop-off.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findLatestSessionByClient = (clientId, client = prisma) =>
  client.workoutSession.findFirst({
    where: { clientId },
    orderBy: { completedAt: "desc" },
  });
