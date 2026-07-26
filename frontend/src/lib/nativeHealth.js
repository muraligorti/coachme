// ═══════════════════════════════════════════════════════════════════════
// NATIVE HEALTH BRIDGE — reads data directly from Apple HealthKit (iOS) or
// Android Health Connect (covers OnePlus, Samsung, and most Android
// trackers, since Health Connect is Android's unified health data hub)
// when running inside the compiled CoachMe native app.
//
// IMPORTANT: neither HealthKit nor Health Connect has ever had a web/REST
// API. This only works inside the Capacitor-wrapped native app after a
// real iOS/Android build (`npx cap sync`) — never in the Vercel-hosted
// browser/PWA version. In the browser, every function here safely returns
// null / throws a clear error so the UI can fall back to manual entry.
//
// Uses @capgo/capacitor-health, a single actively-maintained plugin that
// unifies both platforms behind one TypeScript API:
// https://github.com/Cap-go/capacitor-health
//
// Setup (run once from a machine with Xcode/Android Studio, not this sandbox):
//   npm install @capgo/capacitor-health
//   npx cap sync
//   iOS: enable HealthKit capability in Xcode + add NSHealthShareUsageDescription
//        to Info.plist (see plugin README)
//   Android: Health Connect permissions ship with the plugin; add a privacy
//        policy per the plugin README (required by Health Connect)
//
// COVERAGE (as of plugin v8.7.0, verified against its published data-type
// table — not a guess): steps, distance, calories, heartRate, weight,
// sleep, oxygenSaturation, restingHeartRate, heartRateVariability,
// bodyFat, and workout sessions (via the separate queryWorkouts() call,
// since workouts aren't a plain numeric sample type). Deliberately NOT
// pulling bloodPressure/bloodGlucose/vo2Max/etc. yet — nothing in the
// current coaching workflow uses them; add them here the same way if
// that changes, rather than pulling everything "just in case."
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";

export const isNativeApp = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform(); // "ios" | "android" | "web"

// The metrics CoachMe's HealthDataSync log entries care about.
const READ_TYPES = [
  "steps", "distance", "calories", "heartRate", "weight", "sleep", "oxygenSaturation",
  "restingHeartRate", "heartRateVariability", "bodyFat", "workouts",
];

// Call this once when the user taps "Connect" on Apple Health / Health
// Connect in the UI. Throws a clear, user-facing message if unavailable.
export async function requestNativeHealthAccess() {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("This only works in the CoachMe mobile app — not the web version. Install the app to connect this device.");
  }
  const availability = await Health.isAvailable();
  if (!availability.available) {
    throw new Error(availability.reason || "Health data isn't available on this device.");
  }
  return Health.requestAuthorization({ read: READ_TYPES, write: [] });
}

// Shared aggregation helper for one [startDate, endDate) window.
async function aggregateWindow(startDate, endDate) {
  const sum = async (dataType) => {
    try {
      const { samples } = await Health.readSamples({ dataType, startDate, endDate, limit: 500 });
      return samples.length ? samples.reduce((s, x) => s + (x.value || 0), 0) : null;
    } catch { return null; }
  };
  const avg = async (dataType) => {
    try {
      const { samples } = await Health.readSamples({ dataType, startDate, endDate, limit: 500 });
      if (!samples.length) return null;
      return Math.round(samples.reduce((s, x) => s + (x.value || 0), 0) / samples.length);
    } catch { return null; }
  };
  const latest = async (dataType) => {
    try {
      const { samples } = await Health.readSamples({ dataType, startDate, endDate, limit: 1, ascending: false });
      return samples[0]?.value ?? null;
    } catch { return null; }
  };
  // Workouts aren't a plain numeric sample — a separate call, summarized
  // into total minutes/count/calories/distance for the day.
  const workoutsSummary = async () => {
    try {
      const { workouts } = await Health.queryWorkouts({ startDate, endDate, limit: 50 });
      if (!workouts?.length) return { workoutMinutes: null, workoutCount: null };
      const totalSeconds = workouts.reduce((s, w) => s + (w.duration || 0), 0);
      return { workoutMinutes: Math.round(totalSeconds / 60), workoutCount: workouts.length };
    } catch { return { workoutMinutes: null, workoutCount: null }; }
  };

  const [steps, caloriesBurned, distanceM, heartRateAvg, spo2, weight, restingHeartRate, hrv, bodyFatPct, workoutsSum] = await Promise.all([
    sum("steps"), sum("calories"), sum("distance"), avg("heartRate"), avg("oxygenSaturation"), latest("weight"),
    avg("restingHeartRate"), avg("heartRateVariability"), latest("bodyFat"), workoutsSummary(),
  ]);

  let sleepHours = null;
  try {
    const sleepStart = new Date(new Date(startDate).getTime() - 12 * 60 * 60 * 1000).toISOString(); // sleep spans into the prior evening
    const { samples } = await Health.readSamples({ dataType: "sleep", startDate: sleepStart, endDate, limit: 200 });
    if (samples.length) sleepHours = +(samples.reduce((s, x) => s + (x.value || 0), 0) / 60).toFixed(1); // minutes -> hours
  } catch { /* no sleep data available */ }

  return {
    steps, caloriesBurned,
    distance: distanceM ? +(distanceM / 1000).toFixed(2) : null, // meters -> km
    heartRateAvg, spo2, weight, sleepHours,
    restingHeartRate, heartRateVariability: hrv, bodyFat: bodyFatPct ? +bodyFatPct.toFixed(1) : null,
    workoutMinutes: workoutsSum.workoutMinutes, workoutCount: workoutsSum.workoutCount,
  };
}

// Reads TODAY's aggregate metrics — used for the "Connect" flow's
// immediate first sync, and for a manual "Sync Now" tap.
export async function readNativeHealthToday() {
  if (!Capacitor.isNativePlatform()) return null;
  const startDate = new Date(); startDate.setHours(0, 0, 0, 0);
  const endDate = new Date();
  const today = endDate.toISOString().slice(0, 10);
  const metrics = await aggregateWindow(startDate.toISOString(), endDate.toISOString());
  return { date: today, source: Capacitor.getPlatform() === "ios" ? "appleHealth" : "healthConnect", ...metrics };
}

// Reads a specific PAST day's finalized totals — used by the end-of-day
// auto-sync (see navigation/useDailyHealthSync.js), so "yesterday" gets
// one clean, complete number instead of syncing a still-in-progress
// "today" repeatedly and calling that a history.
export async function readNativeHealthForDate(dateStr) {
  if (!Capacitor.isNativePlatform()) return null;
  const startDate = new Date(dateStr + "T00:00:00"); const endDate = new Date(dateStr + "T23:59:59.999");
  const metrics = await aggregateWindow(startDate.toISOString(), endDate.toISOString());
  return { date: dateStr, source: Capacitor.getPlatform() === "ios" ? "appleHealth" : "healthConnect", ...metrics };
}
