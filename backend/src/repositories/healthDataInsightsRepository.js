// ═══════════════════════════════════════════════════════════════════════
// HEALTH DATA REPOSITORY (insights-focused) — narrow, read-only query used
// by insightsService to detect a connected client's activity/data going
// quiet (distinct from them never having connected a device at all).
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const findLatestSyncByClient = (clientId, client = prisma) =>
  client.healthDataSync.findFirst({
    where: { clientId },
    orderBy: { syncedAt: "desc" },
  });
