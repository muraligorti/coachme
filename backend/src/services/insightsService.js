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
//
// THRESHOLDS ARE CONFIGURABLE PER COACH. A coach who sees clients weekly
// has a very different definition of "gone quiet" than one who runs a
// twice-a-week bootcamp. Rather than hardcode one set of numbers for
// every coach, thresholds live in CoachProfile.insightSettings (a nullable
// JSON column) and merge over DEFAULT_SETTINGS below — a coach who's never
// touched their settings gets sensible defaults; one who has gets their
// own overrides, field by field (a partial override doesn't reset the rest).
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
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

export const DEFAULT_SETTINGS = {
  workoutGapModerateDays: 7,
  workoutGapSevereDays: 14,
  nutritionGapDays: 14,
  healthSyncGapDays: 10,
  bookingDropModeratePct: 30,
  bookingDropSeverePct: 60,
  coldLeadDays: 7,
};

export const SETTINGS_BOUNDS = {
  workoutGapModerateDays: { min: 2, max: 30 },
  workoutGapSevereDays: { min: 5, max: 60 },
  nutritionGapDays: { min: 3, max: 60 },
  healthSyncGapDays: { min: 3, max: 60 },
  bookingDropModeratePct: { min: 10, max: 90 },
  bookingDropSeverePct: { min: 20, max: 95 },
  coldLeadDays: { min: 2, max: 30 },
};

function getEffectiveSettings(coachProfile) {
  return { ...DEFAULT_SETTINGS, ...(coachProfile?.insightSettings || {}) };
}

export async function getSettings(userId) {
  const profile = await profileRepository.findCoachProfileByUserId(userId);
  if (!profile) throw new AppError(404, "Coach profile not found");
  return { settings: getEffectiveSettings(profile), defaults: DEFAULT_SETTINGS, bounds: SETTINGS_BOUNDS };
}

export async function updateSettings(userId, updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (!(key in DEFAULT_SETTINGS)) throw new AppError(400, `Unknown setting: ${key}`);
    const bounds = SETTINGS_BOUNDS[key];
    if (typeof value !== "number" || Number.isNaN(value)) throw new AppError(400, `${key} must be a number`);
    if (value < bounds.min || value > bounds.max) {
      throw new AppError(400, `${key} must be between ${bounds.min} and ${bounds.max}`);
    }
  }
  const profile = await profileRepository.findCoachProfileByUserId(userId);
  if (!profile) throw new AppError(404, "Coach profile not found");
  const merged = { ...(profile.insightSettings || {}), ...updates };
  await profileRepository.updateCoachProfile(userId, { insightSettings: merged });
  return { settings: getEffectiveSettings({ insightSettings: merged }), defaults: DEFAULT_SETTINGS, bounds: SETTINGS_BOUNDS };
}

async function computeRiskForClient(clientProfileId, settings) {
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

  if (priorBookings >= 2) {
    const dropPct = Math.round(((priorBookings - recentBookings) / priorBookings) * 100);
    if (dropPct >= settings.bookingDropSeverePct) { reasons.push(`Booking frequency down ${dropPct}% vs their own recent average`); severeSignalFired = true; }
    else if (dropPct >= settings.bookingDropModeratePct) reasons.push(`Booking frequency down ${dropPct}% vs their own recent average`);
  }

  const workoutGapDays = daysSince(lastWorkout?.completedAt);
  if (workoutGapDays !== null) {
    if (workoutGapDays >= settings.workoutGapSevereDays) { reasons.push(`No workout logged in ${workoutGapDays} days`); severeSignalFired = true; }
    else if (workoutGapDays >= settings.workoutGapModerateDays) reasons.push(`No workout logged in ${workoutGapDays} days`);
  }

  const nutritionGapDays = daysSince(lastNutrition?.createdAt);
  if (nutritionGapDays !== null && nutritionGapDays >= settings.nutritionGapDays) {
    reasons.push(`No nutrition log in ${nutritionGapDays} days`);
  }

  const healthGapDays = daysSince(lastHealthSync?.syncedAt);
  if (lastHealthSync && healthGapDays !== null && healthGapDays >= settings.healthSyncGapDays) {
    reasons.push(`Connected device hasn't synced in ${healthGapDays} days`);
  }

  const flagged = severeSignalFired || reasons.length >= 2;
  return { flagged, reasons };
}

export async function computeClientRisks(coachId, settings) {
  const relationships = await clientCoachRepository.findActiveClientsForCoach(coachId);
  const results = {};
  await Promise.all(relationships.map(async (rel) => {
    const risk = await computeRiskForClient(rel.clientId, settings);
    results[rel.clientId] = { ...risk, clientName: rel.client?.displayName || "Client" };
  }));
  return results;
}

export async function computeColdLeads(coachId, staleDays) {
  const since = new Date(Date.now() - staleDays * DAY_MS);
  const leads = await leadInsightsRepository.findColdLeads(coachId, since);
  return leads.map((l) => ({
    id: l.id, name: l.name,
    daysSinceContact: l.contactedAt ? daysSince(l.contactedAt) : daysSince(l.createdAt),
    everContacted: !!l.contactedAt,
  }));
}

async function computeCapacityInsight(coachId, userId) {
  const [relationships, subscription] = await Promise.all([
    clientCoachRepository.findActiveClientsForCoach(coachId),
    profileRepository.findSubscriptionByUserId(userId),
  ]);
  const activeCount = relationships.length;
  const max = subscription?.maxClients || 5;
  if (max >= 999) return null;
  const remaining = max - activeCount;
  if (remaining <= 5 && remaining >= 0) {
    return { activeCount, max, remaining, tier: subscription?.tier || "FREE" };
  }
  return null;
}

export async function getBriefing(coachId, userId) {
  const profile = await profileRepository.findCoachProfileByUserId(userId);
  const settings = getEffectiveSettings(profile);

  const [risks, coldLeads, capacity] = await Promise.all([
    computeClientRisks(coachId, settings),
    computeColdLeads(coachId, settings.coldLeadDays),
    computeCapacityInsight(coachId, userId),
  ]);

  const items = [];

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
      why: `No follow-up in ${settings.coldLeadDays}+ days — ${coldLeads.slice(0, 3).map((l) => l.name).join(", ")}`,
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
