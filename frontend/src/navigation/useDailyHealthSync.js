// ═══════════════════════════════════════════════════════════════════════
// DAILY HEALTH SYNC — a lightweight, honest substitute for a true
// midnight background job, which a Capacitor app can't reliably run
// while closed without adding a separate native background-task plugin
// (deliberately not pulled in for this — real added complexity for a
// coaching app that isn't a fitness-tracking-first product).
//
// What this actually does: the FIRST time the client opens the app on a
// new calendar day, it syncs YESTERDAY's finalized totals (not "today",
// which is still live/incomplete) for whichever native source (Health
// Connect / Apple Health) is connected. This gives a clean, complete
// number per day without needing the app open at midnight — the trade-
// off is that if a client doesn't open the app for several days, those
// days are simply not backfilled (Health Connect's own 30-day read
// window is the practical ceiling if that's ever revisited).
// ═══════════════════════════════════════════════════════════════════════
import { useEffect } from "react";
import { ls } from "../lib/storage.js";
import { api } from "../lib/api.js";
import { isNativeApp, readNativeHealthForDate } from "../lib/nativeHealth.js";

export function useDailyHealthSync() {
  useEffect(() => {
    if (!isNativeApp()) return; // no-op in the browser/PWA build
    const today = new Date().toISOString().slice(0, 10);
    const lastSynced = ls.get("last_daily_health_sync", null);
    if (lastSynced === today) return; // already ran today, don't re-fire on every screen visit

    const connections = ls.get("device_connections", {});
    const nativeSource = connections.healthConnect ? "healthConnect" : connections.appleHealth ? "appleHealth" : null;
    if (!nativeSource) { ls.set("last_daily_health_sync", today); return; } // nothing connected — nothing to sync, don't retry all day

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    readNativeHealthForDate(yesterday)
      .then((entry) => { if (entry) return api.post("/health-data/sync", { entries: [entry] }); })
      .catch(() => { /* fail silently — a manual "Sync Now" tap in Fitness Devices remains available */ })
      .finally(() => ls.set("last_daily_health_sync", today));
  }, []);
}
