// ═══════════════════════════════════════════════════════════════════════
// NUTRITION REPOSITORY (insights-focused) — narrow, read-only query used
// by insightsService to detect nutrition-logging drop-off.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findLatestLogByClient = (clientId, client = prisma) =>
  client.nutritionLog.findFirst({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
