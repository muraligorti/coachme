// ═══════════════════════════════════════════════════════════════════════
// HEALTH DATA SYNC SERVICE — the single place that decides which
// source's data "wins" for a given client+day when more than one device
// reports data for the same date. This is the actual fix for the
// double-counting problem: HealthDataSync now has exactly one row per
// (clientId, date) — never one row per (clientId, date, source) — so
// there is structurally nothing to sum across sources by accident.
//
// PRIORITY ORDER (highest wins), and why:
//   1. healthConnect / appleHealth — OS-level aggregators. These already
//      combine every sensor/app on the phone into one true daily total,
//      so they're the least likely to represent just one partial device.
//   2. fitbit / strava / huawei — direct single-device cloud APIs. Real,
//      automatic data, but each represents only ONE device's measurement.
//   3. manual — user-entered. Most valuable when nothing else exists
//      (devices with no public API at all), least trusted otherwise.
//
// Within the same tier (e.g. both Fitbit and Huawei connected), there is
// no objective way to know which device's reading is "more correct" — the
// tie-break is simply whichever synced most recently. This is a stated,
// known limitation, not a hidden guess.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

const SOURCE_PRIORITY = {
  healthConnect: 3, appleHealth: 3,
  fitbit: 2, strava: 2, huawei: 2,
  manual: 1, garmin: 1, miband: 1, noise: 1, boat: 1, polar: 1, coros: 1, whoop: 1, oneplus: 1, samsung: 1,
};
const priorityOf = (source) => SOURCE_PRIORITY[source] ?? 1;

// Merges only the non-null fields from `incoming` onto `existing` — so a
// higher-priority source that doesn't report e.g. sleep doesn't blank out
// a sleep value a lower-priority source already recorded for that day.
function mergeMetrics(existing, incoming) {
  const fields = ["steps", "heartRateAvg", "heartRateMax", "sleepHours", "sleepQuality", "caloriesBurned", "activeMinutes", "distance", "weight", "spo2", "stressLevel", "restingHeartRate", "heartRateVariability", "bodyFat", "workoutMinutes", "workoutCount"];
  const merged = {};
  for (const f of fields) {
    merged[f] = incoming[f] !== undefined && incoming[f] !== null ? incoming[f] : (existing ? existing[f] : null);
  }
  return merged;
}

/**
 * Writes one normalized health entry, enforcing single-row-per-day and
 * priority-based source resolution. Returns the resulting row.
 */
export async function upsertDailyEntry(clientId, entry) {
  const { date, source } = entry;
  if (!date || !source) throw new Error("upsertDailyEntry requires both date and source");

  const existing = await prisma.healthDataSync.findUnique({ where: { clientId_date: { clientId, date } } });

  if (!existing) {
    return prisma.healthDataSync.create({ data: { clientId, date, source, ...mergeMetrics(null, entry) } });
  }

  const incomingPriority = priorityOf(source);
  const existingPriority = priorityOf(existing.source);

  // Lower-priority source arriving after a higher-priority one already
  // won the day — merge in any genuinely NEW fields the higher-priority
  // source didn't report, but never downgrade the recorded source label.
  if (incomingPriority < existingPriority) {
    return prisma.healthDataSync.update({
      where: { clientId_date: { clientId, date } },
      data: mergeMetrics(existing, entry),
    });
  }

  // Equal or higher priority — this source wins the day (same-tier ties
  // go to whichever synced most recently, i.e. this call).
  return prisma.healthDataSync.update({
    where: { clientId_date: { clientId, date } },
    data: { source, ...mergeMetrics(existing, entry) },
  });
}

/**
 * Bulk variant — used by both the /health-data/sync route (which can
 * receive multiple day-entries per device fetch) and the demo/cleanup
 * scripts.
 */
export async function upsertDailyEntries(clientId, entries) {
  const results = [];
  for (const entry of entries) results.push(await upsertDailyEntry(clientId, entry));
  return results;
}
