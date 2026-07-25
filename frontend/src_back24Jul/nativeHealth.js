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
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
import { Health } from "@capgo/capacitor-health";

export const isNativeApp = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform(); // "ios" | "android" | "web"

// The metrics CoachMe's HealthDataSync log entries care about.
const READ_TYPES = ["steps", "distance", "calories", "heartRate", "weight", "sleep", "oxygenSaturation"];

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

// Reads today's aggregate metrics and shapes them into the same fields
// CoachMe's HealthDataSync log entries use, ready to POST to /health-data/sync.
// Returns null in the browser or if nothing could be read.
export async function readNativeHealthToday() {
  if (!Capacitor.isNativePlatform()) return null;
  const startDate = new Date(); startDate.setHours(0, 0, 0, 0);
  const endDate = new Date();
  const today = endDate.toISOString().slice(0, 10);

  const sum = async (dataType) => {
    try {
      const { samples } = await Health.readSamples({ dataType, startDate: startDate.toISOString(), endDate: endDate.toISOString(), limit: 500 });
      return samples.length ? samples.reduce((s, x) => s + (x.value || 0), 0) : null;
    } catch { return null; }
  };
  const avg = async (dataType) => {
    try {
      const { samples } = await Health.readSamples({ dataType, startDate: startDate.toISOString(), endDate: endDate.toISOString(), limit: 500 });
      if (!samples.length) return null;
      return Math.round(samples.reduce((s, x) => s + (x.value || 0), 0) / samples.length);
    } catch { return null; }
  };
  const latest = async (dataType) => {
    try {
      const { samples } = await Health.readSamples({ dataType, startDate: startDate.toISOString(), endDate: endDate.toISOString(), limit: 1, ascending: false });
      return samples[0]?.value ?? null;
    } catch { return null; }
  };

  const [steps, caloriesBurned, distanceM, heartRateAvg, spo2, weight] = await Promise.all([
    sum("steps"), sum("calories"), sum("distance"), avg("heartRate"), avg("oxygenSaturation"), latest("weight"),
  ]);

  let sleepHours = null;
  try {
    const { samples } = await Health.readSamples({
      dataType: "sleep",
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: endDate.toISOString(),
      limit: 200,
    });
    if (samples.length) sleepHours = +(samples.reduce((s, x) => s + (x.value || 0), 0) / 60).toFixed(1); // minutes -> hours
  } catch { /* no sleep data available */ }

  return {
    date: today,
    source: Capacitor.getPlatform() === "ios" ? "appleHealth" : "healthConnect",
    steps, caloriesBurned,
    distance: distanceM ? +(distanceM / 1000).toFixed(2) : null, // meters -> km
    heartRateAvg, spo2, weight, sleepHours,
  };
}
