// ═══════════════════════════════════════════════════════════════════════
// LOCAL REMINDERS — session/check-in/habit/nutrition/sync reminders are
// scheduled entirely on-device using the device's own clock, not
// triggered by a server-side cron. This is deliberately different from
// push notifications: no server round-trip needed at the trigger moment,
// no timezone conversion needed (the device's clock IS the correct
// timezone for "remind me at MY 6pm"), and no dependency on a
// third-party scheduler's timing being exact.
//
// MULTI-IDENTITY SAFE: one device can log in as different accounts at
// different times. Every notification ID is deterministically derived
// from (userId + type) or (userId + bookingId), so logging in as a
// different account never cancels or overwrites another account's
// already-scheduled reminders.
//
// Event-driven notifications (like "a client requested a cancellation")
// are NOT part of this — those still go through real push. See
// pushService.js on the backend for those.
//
// DEBUG LOGGING: every significant step (plugin availability, permission
// status, each schedule attempt and its outcome) is written to a
// persistent, cappped log in localStorage — visible via the debug
// section in Notification Settings. This exists because console.error()
// is invisible on a real installed device with no dev tools attached;
// without this, a silent failure here is genuinely undiagnosable from
// outside the device.
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
import { ls } from "./storage.js";

const DEBUG_LOG_KEY = "local_reminders_debug_log";
const MAX_LOG_ENTRIES = 50;

function debugLog(message) {
  const entries = ls.get(DEBUG_LOG_KEY, []);
  entries.unshift({ at: new Date().toISOString(), message });
  ls.set(DEBUG_LOG_KEY, entries.slice(0, MAX_LOG_ENTRIES));
  console.log("[localReminders]", message);
}

// Public alias — lets other modules (like AuthContext) log into the same
// visible debug trail, e.g. to prove an effect actually started running
// before anything else has a chance to fail.
export const logDebugEvent = debugLog;

export function getDebugLog() {
  return ls.get(DEBUG_LOG_KEY, []);
}

export function clearDebugLog() {
  ls.set(DEBUG_LOG_KEY, []);
}

const DAILY_TITLES = {
  checkin: { title: "Check-in Reminder", body: "How's your day going? Log a quick check-in with your coach." },
  habit: { title: "Habit Reminder", body: "Don't forget to log today's habits!" },
  nutrition: { title: "Nutrition Reminder", body: "Time to log your meals for today." },
  sync: { title: "Sync Reminder", body: "Open the app to sync your latest health data." },
};

function hashToId(str, rangeOffset) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 900000) + rangeOffset;
}
const dailyId = (userId, type) => hashToId(`${userId}:daily:${type}`, 100000);
const sessionId = (userId, bookingId) => hashToId(`${userId}:session:${bookingId}`, 2000000);

let LocalNotificationsPlugin = null;
async function getPlugin() {
  try {
    if (!Capacitor.isNativePlatform()) { debugLog("Not a native platform — local reminders are a no-op on web"); return null; }
    if (!LocalNotificationsPlugin) {
      ({ LocalNotifications: LocalNotificationsPlugin } = await import("@capacitor/local-notifications"));
      debugLog("Plugin loaded successfully");
    }
    return LocalNotificationsPlugin;
  } catch (e) { debugLog(`❌ getPlugin() internal failure: ${e.message}`); return null; }
}

export async function initLocalReminders() {
  debugLog("initLocalReminders: starting");
  let plugin;
  try { plugin = await getPlugin(); } catch (e) { debugLog(`❌ getPlugin() threw unexpectedly: ${e.message}`); return; }
  if (!plugin) { debugLog("initLocalReminders: no plugin available, stopping here"); return; }
  try {
    const perm = await plugin.checkPermissions();
    debugLog(`Notification permission status: ${perm.display}`);
    if (perm.display === "prompt") {
      const result = await plugin.requestPermissions();
      debugLog(`Notification permission requested, result: ${result.display}`);
    } else if (perm.display === "denied") {
      debugLog("⚠️ Notification permission is DENIED — reminders cannot fire until this is granted in Android system settings");
    }
  } catch (e) { debugLog(`Notification permission check/request failed: ${e.message}`); }

  // Separate from notification permission — Android 12+ requires this
  // specifically for precisely-timed alarms, denied by default on
  // Android 13+ fresh installs. Without it, scheduling still succeeds
  // (shows up as "pending") but delivery silently falls back to inexact
  // timing, which can be delayed arbitrarily by the OS. This is
  // genuinely a different permission living in a different settings
  // screen than regular notifications, easy to miss entirely.
  try {
    if (typeof plugin.checkExactNotificationSetting === "function") {
      const exactPerm = await plugin.checkExactNotificationSetting();
      debugLog(`Exact alarm permission status: ${exactPerm.exact_alarm}`);
      if (exactPerm.exact_alarm !== "granted" && typeof plugin.changeExactNotificationSetting === "function") {
        debugLog("Exact alarm permission not granted — prompting user via system settings");
        const changed = await plugin.changeExactNotificationSetting();
        debugLog(`Exact alarm permission after prompt: ${changed.exact_alarm}`);
      }
    } else {
      debugLog("Plugin does not expose checkExactNotificationSetting — cannot verify exact alarm permission from here; check manually via Settings > Apps > Special app access > Alarms & reminders");
    }
  } catch (e) { debugLog(`Exact alarm permission check failed: ${e.message} — check manually via Settings > Apps > Special app access > Alarms & reminders`); }
}

export async function scheduleDailyReminders(userId, prefs) {
  let plugin; try { plugin = await getPlugin(); } catch (e) { debugLog(`❌ getPlugin() threw unexpectedly: ${e.message}`); return; }
  if (!plugin) { debugLog("scheduleDailyReminders: no plugin, aborting"); return; }
  if (!prefs) { debugLog("scheduleDailyReminders: no prefs provided, aborting"); return; }
  if (!userId) { debugLog("scheduleDailyReminders: no userId provided, aborting"); return; }

  const ids = ["checkin", "habit", "nutrition", "sync"].map(type => dailyId(userId, type));
  try { await plugin.cancel({ notifications: ids.map(id => ({ id })) }); } catch (e) { debugLog(`Cancel existing daily reminders failed (may be harmless if none existed): ${e.message}`); }

  const toSchedule = [];
  for (const type of ["checkin", "habit", "nutrition", "sync"]) {
    if (!prefs[`${type}ReminderEnabled`]) continue;
    const [hour, minute] = (prefs[`${type}ReminderTime`] || "08:00").split(":").map(Number);
    toSchedule.push({
      id: dailyId(userId, type),
      title: DAILY_TITLES[type].title,
      body: DAILY_TITLES[type].body,
      channelId: "reminders",
      schedule: { on: { hour, minute }, allowWhileIdle: true },
    });
  }
  debugLog(`scheduleDailyReminders: ${toSchedule.length} reminder(s) to schedule (${toSchedule.map(t => t.title).join(", ") || "none enabled"})`);
  if (toSchedule.length > 0) {
    try { await plugin.schedule({ notifications: toSchedule }); debugLog(`Daily reminders scheduled successfully: IDs ${toSchedule.map(t => t.id).join(", ")}`); }
    catch (e) { debugLog(`❌ Failed to schedule daily reminders: ${e.message}`); }
  }
}

export async function scheduleSessionReminders(userId, bookings, leadMinutes) {
  let plugin; try { plugin = await getPlugin(); } catch (e) { debugLog(`❌ getPlugin() threw unexpectedly: ${e.message}`); return; }
  if (!plugin) { debugLog("scheduleSessionReminders: no plugin, aborting"); return; }
  if (!userId) { debugLog("scheduleSessionReminders: no userId, aborting"); return; }

  const storageKey = `scheduled_session_reminder_ids_${userId}`;
  const previousIds = ls.get(storageKey, []);
  if (previousIds.length > 0) {
    try { await plugin.cancel({ notifications: previousIds.map(id => ({ id })) }); } catch (e) { debugLog(`Cancel existing session reminders failed: ${e.message}`); }
  }

  if (!leadMinutes || leadMinutes <= 0) { debugLog(`scheduleSessionReminders: lead time is ${leadMinutes} (reminder disabled or invalid) — nothing scheduled`); ls.set(storageKey, []); return; }
  if (!Array.isArray(bookings)) { debugLog("scheduleSessionReminders: bookings is not an array, aborting"); ls.set(storageKey, []); return; }

  const now = Date.now();
  const toSchedule = [];
  const newIds = [];
  const confirmedBookings = bookings.filter(b => (b.status || "").toUpperCase() === "CONFIRMED");
  debugLog(`scheduleSessionReminders: ${bookings.length} booking(s) total, ${confirmedBookings.length} confirmed, lead time ${leadMinutes}min`);

  confirmedBookings.forEach((b) => {
    const start = new Date(b.scheduledAt || b.date).getTime();
    const fireAt = start - leadMinutes * 60000;
    const minutesUntilFire = Math.round((fireAt - now) / 60000);
    if (fireAt <= now) {
      debugLog(`Skipping booking ${b.id}: fire time already passed (was ${Math.abs(minutesUntilFire)} min ago)`);
      return;
    }
    const id = sessionId(userId, b.id);
    newIds.push(id);
    toSchedule.push({
      id,
      title: "Upcoming Session",
      body: `Your session is at ${new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      channelId: "reminders",
      schedule: { at: new Date(fireAt) },
    });
    debugLog(`Queued booking ${b.id}: will fire in ${minutesUntilFire} min (at ${new Date(fireAt).toLocaleString()})`);
  });

  ls.set(storageKey, newIds);
  if (toSchedule.length > 0) {
    try { await plugin.schedule({ notifications: toSchedule }); debugLog(`✅ Session reminders scheduled successfully: ${toSchedule.length} notification(s)`); }
    catch (e) { debugLog(`❌ Failed to schedule session reminders: ${e.message}`); }
  } else {
    debugLog("scheduleSessionReminders: nothing to schedule (no confirmed bookings within the lead-time window)");
  }
}

export async function refreshSessionReminders(userId, bookings) {
  if (!userId) { debugLog("refreshSessionReminders: no userId, aborting"); return; }
  const { api } = await import("./api.js");
  try {
    const prefs = await api.get("/notification-preferences/me");
    debugLog(`refreshSessionReminders: fetched prefs, sessionReminderMinutes=${prefs?.sessionReminderMinutes}`);
    await scheduleSessionReminders(userId, bookings, prefs?.sessionReminderMinutes ?? 60);
  } catch (e) { debugLog(`❌ refreshSessionReminders: failed to fetch preferences: ${e.message}`); }
}

export async function getPendingLocalReminders() {
  let plugin; try { plugin = await getPlugin(); } catch (e) { debugLog(`❌ getPlugin() threw unexpectedly: ${e.message}`); return []; }
  if (!plugin) return [];
  try {
    const result = await plugin.getPending();
    return (result.notifications || []).map(n => ({
      id: n.id,
      title: n.title,
      body: n.body,
      fireAt: n.schedule?.at || (n.schedule?.on ? `daily at ${String(n.schedule.on.hour).padStart(2, "0")}:${String(n.schedule.on.minute).padStart(2, "0")}` : "unknown"),
    }));
  } catch (e) { debugLog(`getPendingLocalReminders failed: ${e.message}`); return []; }
}
