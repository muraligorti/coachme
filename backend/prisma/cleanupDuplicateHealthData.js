// ═══════════════════════════════════════════════════════════════════════
// ONE-TIME CLEANUP: run this BEFORE applying the schema change that
// tightens HealthDataSync's unique constraint from
// [clientId, date, source] to [clientId, date].
//
// If any client currently has more than one row for the same day (e.g.
// they had both Fitbit and Health Connect connected before this fix),
// the new, tighter constraint will fail to apply until those duplicates
// are collapsed. This script does exactly that collapse — using the
// same priority logic as services/healthDataSyncService.js — so nothing
// has to be deleted blindly and the "winning" row is chosen consistently
// with how new syncs will behave going forward.
//
// USAGE (run from backend/, with DATABASE_URL pointing at your real DB,
// BEFORE running `npx prisma db push` for the updated schema):
//   node prisma/cleanupDuplicateHealthData.js
// ═══════════════════════════════════════════════════════════════════════
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const SOURCE_PRIORITY = {
  healthConnect: 3, appleHealth: 3,
  fitbit: 2, strava: 2, huawei: 2,
  manual: 1, garmin: 1, miband: 1, noise: 1, boat: 1, polar: 1, coros: 1, whoop: 1, oneplus: 1, samsung: 1,
};
const priorityOf = (source) => SOURCE_PRIORITY[source] ?? 1;

function mergeMetrics(rows) {
  // Sort ascending by priority so later spreads (higher priority) win,
  // but any field a higher-priority row left null still gets filled in
  // by a lower-priority row that did report it.
  const sorted = [...rows].sort((a, b) => priorityOf(a.source) - priorityOf(b.source));
  const fields = ["steps", "heartRateAvg", "heartRateMax", "sleepHours", "sleepQuality", "caloriesBurned", "activeMinutes", "distance", "weight", "spo2", "stressLevel", "restingHeartRate", "heartRateVariability", "bodyFat", "workoutMinutes", "workoutCount"];
  const merged = {};
  for (const row of sorted) {
    for (const f of fields) {
      if (row[f] !== null && row[f] !== undefined) merged[f] = row[f];
    }
  }
  const winner = sorted[sorted.length - 1];
  return { ...merged, source: winner.source };
}

async function main() {
  console.log("Scanning HealthDataSync for duplicate (clientId, date) rows...");
  const all = await prisma.healthDataSync.findMany({ orderBy: [{ clientId: "asc" }, { date: "asc" }] });

  const groups = {};
  for (const row of all) {
    const key = `${row.clientId}__${row.date}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  const duplicateKeys = Object.keys(groups).filter((k) => groups[k].length > 1);
  console.log(`Found ${duplicateKeys.length} client+date combination(s) with duplicate rows (out of ${Object.keys(groups).length} total).`);

  if (duplicateKeys.length === 0) {
    console.log("No duplicates found — safe to run `npx prisma db push` now.");
    return;
  }

  let collapsed = 0;
  for (const key of duplicateKeys) {
    const rows = groups[key];
    const [clientId, date] = [rows[0].clientId, rows[0].date];
    const merged = mergeMetrics(rows);

    console.log(`  ${clientId} / ${date}: collapsing ${rows.length} rows (sources: ${rows.map((r) => r.source).join(", ")}) -> keeping source "${merged.source}"`);

    // Keep the first row's id, update it with merged data, delete the rest.
    const keepId = rows[0].id;
    const deleteIds = rows.slice(1).map((r) => r.id);

    await prisma.healthDataSync.update({ where: { id: keepId }, data: merged });
    if (deleteIds.length) await prisma.healthDataSync.deleteMany({ where: { id: { in: deleteIds } } });
    collapsed++;
  }

  console.log(`\nDone. Collapsed ${collapsed} duplicate group(s). You can now run: npx prisma db push`);
}

main()
  .catch((e) => { console.error("Cleanup failed:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
