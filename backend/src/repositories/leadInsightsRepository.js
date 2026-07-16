// ═══════════════════════════════════════════════════════════════════════
// LEAD REPOSITORY (insights-focused) — narrow, read-only query used by
// insightsService to flag leads that have gone quiet.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

// Leads not yet won or lost, with no contact recorded since `since` — and
// for leads never contacted at all, created before `since`.
export const findColdLeads = (coachId, since, client = prisma) =>
  client.lead.findMany({
    where: {
      coachId,
      status: { notIn: ["CONVERTED", "LOST"] },
      OR: [
        { contactedAt: null, createdAt: { lt: since } },
        { contactedAt: { lt: since } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
