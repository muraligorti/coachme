// ═══════════════════════════════════════════════════════════════════════
// INSIGHTS SERVICE — computes the Daily Briefing, per-client risk flags,
// cold-lead detection, and the grounded-context block the AI assistant
// uses. This is the "second brain" logic: it decides WHAT deserves a
// coach's attention, never just fetches data — that decision-making is
// exactly why this lives in the service layer, not a repository.
//
// Design rule followed throughout (see Volume 4 AI Principles): never
// flag on a single weak signal alone. Every risk flag states the specific
// reasons it fired — no bare scores, ever.
// ═══════════════════════════════════════════════════════════════════════
import * as clientCoachRepository from "../repositories/clientCoachRepository.js";
import * as bookingRepository from "../repositories/bookingRepository.js";
import * as workoutInsightsRepository from "../repositories/workoutInsightsRepository.js";
import * as nutritionInsightsRepository from "../repositories/nutritionInsightsRepository.js";
import * as healthDataInsightsRepository from "../repositories/healthDataInsightsRepository.js";
import * as leadInsightsRepository from "../repositories/leadInsightsRepository.js";
import * as profileRepository from "../repositories/profileRepository.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS);
}

// ─── Per-client risk computation ───────────────────────────────────────
// Combines multiple weak signals into one flag. A single moderate signal
// never fires alone; either one severe signal, or two-or-more moderate
// signals together, are required — this is a deliberate design choice
// (see Volume 4 AI Principles), not an accident of implementation.
async function computeRiskForClient(clientProfileId) {
  const now = new Date();
  const thirtyAgo = new Date(now - 30 * DAY_MS);
  const sixtyAgo = new Date(now - 60 * DAY_MS);

  const [recentBookings, priorBookings, lastWorkout, lastNutrition, lastHealthSync] = await Promise.all([
    bookingRepository.countInRange(clientProfileId, thirtyAgo, now),
    bookingRepository.countInRange(clientProfileId, sixtyAgo, thirtyAgo),
    workoutInsightsRepository.findLatestSessionByClient(clientProfileId),
    nutritionInsightsRepository.findLatestLogByClient(clientProfileId),
    healthDataInsightsRepository.findLatestSyncByClient(clientProfileId),
  ]);

  const reasons = [];
  let severeSignalFired = false;

  // Booking cadence drop — only meaningful if there was a prior baseline to drop from.
  if (priorBookings >= 2) {
    const dropPct = Math.round(((priorBookings - recentBookings) / priorBookings) * 100);
    if (dropPct >= 60) { reasons.push(`Booking frequency down ${dropPct}% vs their own recent average`); severeSignalFired = true; }
    else if (dropPct >= 30) reasons.push(`Booking frequency down ${dropPct}% vs their own recent average`);
  }

  const workoutGapDays = daysSince(lastWorkout?.completedAt);
  if (workoutGapDays !== null) {
    if (workoutGapDays >= 14) { reasons.push(`No workout logged in ${workoutGapDays} days`); severeSignalFired = true; }
    else if (workoutGapDays >= 7) reasons.push(`No workout logged in ${workoutGapDays} days`);
  }

  const nutritionGapDays = daysSince(lastNutrition?.createdAt);
  if (nutritionGapDays !== null && nutritionGapDays >= 14) {
    reasons.push(`No nutrition log in ${nutritionGapDays} days`);
  }

  const healthGapDays = daysSince(lastHealthSync?.syncedAt);
  if (lastHealthSync && healthGapDays !== null && healthGapDays >= 10) {
    reasons.push(`Connected device hasn't synced in ${healthGapDays} days`);
  }

  const flagged = severeSignalFired || reasons.length >= 2;
  return { flagged, reasons };
}

// Returns { [clientProfileId]: { flagged, reasons, clientName } } for every
// active client of this coach. Used by both the Clients-page risk badges
// and the Daily Briefing.
export async function computeClientRisks(coachId) {
  const relationships = await clientCoachRepository.findActiveClientsForCoach(coachId);
  const results = {};
  await Promise.all(relationships.map(async (rel) => {
    const risk = await computeRiskForClient(rel.clientId);
    results[rel.clientId] = { ...risk, clientName: rel.client?.displayName || "Client" };
  }));
  return results;
}

// ─── Cold leads ─────────────────────────────────────────────────────────
export async function computeColdLeads(coachId, staleDays = 7) {
  const since = new Date(Date.now() - staleDays * DAY_MS);
  const leads = await leadInsightsRepository.findColdLeads(coachId, since);
  return leads.map((l) => ({
    id: l.id, name: l.name,
    daysSinceContact: l.contactedAt ? daysSince(l.contactedAt) : daysSince(l.createdAt),
    everContacted: !!l.contactedAt,
  }));
}

// ─── Capacity / tier insight ────────────────────────────────────────────
async function computeCapacityInsight(coachId, userId) {
  const [relationships, subscription] = await Promise.all([
    clientCoachRepository.findActiveClientsForCoach(coachId),
    profileRepository.findSubscriptionByUserId(userId),
  ]);
  const activeCount = relationships.length;
  const max = subscription?.maxClients || 5;
  if (max >= 999) return null; // effectively unlimited tier — nothing worth flagging
  const remaining = max - activeCount;
  if (remaining <= 5 && remaining >= 0) {
    return { activeCount, max, remaining, tier: subscription?.tier || "FREE" };
  }
  return null;
}

// ─── Daily Briefing assembly ────────────────────────────────────────────
// Returns a small, prioritized list (max 5 items) — never a wall of data.
// An empty list is a valid, positive outcome; the UI is responsible for
// showing "all clear" rather than this service manufacturing urgency.
export async function getBriefing(coachId, userId) {
  const [risks, coldLeads, capacity] = await Promise.all([
    computeClientRisks(coachId),
    computeColdLeads(coachId),
    computeCapacityInsight(coachId, userId),
  ]);

  const items = [];

  // Flagged clients first — sorted by number of contributing reasons (most concerning first)
  Object.entries(risks)
    .filter(([, r]) => r.flagged)
    .sort((a, b) => b[1].reasons.length - a[1].reasons.length)
    .slice(0, 3)
    .forEach(([clientId, r]) => {
      items.push({
        type: "client_risk", icon: "⚠️", clientId, clientName: r.clientName,
        headline: `${r.clientName} may need attention`,
        why: r.reasons.join(" · "),
        action: { label: "View profile", nav: "clients", clientId },
      });
    });

  if (coldLeads.length > 0) {
    items.push({
      type: "cold_leads", icon: "🧊",
      headline: coldLeads.length === 1 ? `1 lead has gone cold` : `${coldLeads.length} leads have gone cold`,
      why: `No follow-up in 7+ days — ${coldLeads.slice(0, 3).map((l) => l.name).join(", ")}`,
      action: { label: "View leads", nav: "leads" },
    });
  }

  if (capacity) {
    items.push({
      type: "capacity", icon: capacity.remaining <= 0 ? "🚫" : "📈",
      headline: capacity.remaining <= 0
        ? `You've reached your ${capacity.tier} client limit`
        : `You're at ${capacity.activeCount}/${capacity.max} clients on ${capacity.tier}`,
      why: capacity.remaining <= 0
        ? "New client sign-ups are blocked until you upgrade or free up a slot"
        : `${capacity.remaining} slot${capacity.remaining === 1 ? "" : "s"} left — worth planning ahead`,
      action: { label: "Review plan", nav: "settings" },
    });
  }

  return { items: items.slice(0, 5), generatedAt: new Date().toISOString() };
}

// ─── Grounded context for the AI assistant ──────────────────────────────
// A compact, plain-text summary of the same signals above, formatted for
// injection into the AI system prompt server-side — so answers like
// "which clients need attention" are grounded in real, current data
// rather than the model guessing.
export async function getGroundedContext(coachId, userId) {
  const briefing = await getBriefing(coachId, userId);
  if (briefing.items.length === 0) {
    return "\n\nCOACHME AI INSIGHTS (server-verified, current as of now): No flagged risks right now — all active clients have normal booking/logging patterns, no cold leads, and capacity is healthy.";
  }
  let ctx = "\n\nCOACHME AI INSIGHTS (server-verified, current as of now):";
  briefing.items.forEach((item) => {
    ctx += `\n- ${item.headline}. ${item.why}`;
  });
  return ctx;
}
