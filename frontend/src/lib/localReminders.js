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
// different times (e.g. testing as both coach and client). Every
// notification ID is deterministically derived from (userId + type) or
// (userId + bookingId), so logging in as a different account never
// cancels or overwrites another account's already-scheduled reminders —
// each account's schedule lives in its own ID space, and each account
// only ever touches its own tracked IDs when rescheduling.
//
// Event-driven notifications (like "a client requested a cancellation")
// are NOT part of this — those still go through real push, since they
// react to someone else's action and this device has no way to know
// about that on its own. See pushService.js on the backend for those.
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
import { ls } from "./storage.js";

const DAILY_TITLES = {
  checkin: { title: "Check-in Reminder", body: "How's your day going? Log a quick check-in with your coach." },
  habit: { title: "Habit Reminder", body: "Don't forget to log today's habits!" },
  nutrition: { title: "Nutrition Reminder", body: "Time to log your meals for today." },
  sync: { title: "Sync Reminder", body: "Open the app to sync your latest health data." },
};

// Simple deterministic string hash -> positive int, kept within a safe
// range for Android notification IDs (32-bit). Not cryptographic —
// doesn't need to be, this just needs to reliably avoid collisions
// between different (userId, key) pairs for a personal reminder app,
// not resist a deliberate attacker.
function hashToId(str, rangeOffset) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 900000) + rangeOffset;
}
const dailyId = (userId, type) => hashToId(`${userId}:daily:${type}`, 100000); // 100000-999999 range
const sessionId = (userId, bookingId) => hashToId(`${userId}:session:${bookingId}`, 2000000); // 2000000-2899999 range, non-overlapping with daily

let LocalNotificationsPlugin = null;
async function getPlugin() {
  if (!Capacitor.isNativePlatform()) return null;
  if (!LocalNotificationsPlugin) {
    try { ({ LocalNotifications: LocalNotificationsPlugin } = await import("@capacitor/local-notifications")); }
    catch (e) { console.error("Local notifications unavailable:", e.message); return null; }
  }
  return LocalNotificationsPlugin;
}

export async function initLocalReminders() {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    const perm = await plugin.checkPermissions();
    if (perm.display === "prompt") await plugin.requestPermissions();
  } catch (e) { console.error("Local notification permission request failed:", e.message); }
}

// Schedules (or re-schedules) this SPECIFIC user's four repeating daily
// reminders — only ever touches IDs derived from this userId, so another
// account's daily reminders (scheduled during a previous login on this
// same device) are left completely alone.
export async function scheduleDailyReminders(userId, prefs) {
  const plugin = await getPlugin();
  if (!plugin || !prefs || !userId) return;

  const ids = ["checkin", "habit", "nutrition", "sync"].map(type => dailyId(userId, type));
  try { await plugin.cancel({ notifications: ids.map(id => ({ id })) }); } catch {}

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
  if (toSchedule.length > 0) {
    try { await plugin.schedule({ notifications: toSchedule }); } catch (e) { console.error("Failed to schedule daily reminders:", e.message); }
  }
}

// Schedules one-time reminders for each of THIS user's upcoming confirmed
// bookings. Tracks previously-scheduled booking IDs per-user (storage key
// includes userId), so cancelling stale ones (a booking that got
// cancelled/rescheduled since last sync) never touches another account's
// tracked reminders on the same device.
export async function scheduleSessionReminders(userId, bookings, leadMinutes) {
  const plugin = await getPlugin();
  if (!plugin || !userId) return;

  const storageKey = `scheduled_session_reminder_ids_${userId}`;
  const previousIds = ls.get(storageKey, []);
  if (previousIds.length > 0) {
    try { await plugin.cancel({ notifications: previousIds.map(id => ({ id })) }); } catch {}
  }

  if (!leadMinutes || leadMinutes <= 0 || !Array.isArray(bookings)) { ls.set(storageKey, []); return; }

  const now = Date.now();
  const toSchedule = [];
  const newIds = [];
  bookings
    .filter(b => (b.status || "").toUpperCase() === "CONFIRMED")
    .forEach((b) => {
      const start = new Date(b.scheduledAt || b.date).getTime();
      const fireAt = start - leadMinutes * 60000;
      if (fireAt <= now) return; // reminder time already passed, or session is sooner than the lead time
      const id = sessionId(userId, b.id); // deterministic from the booking's own ID — stable across repeated calls, never collides with another user's reminders
      newIds.push(id);
      toSchedule.push({
        id,
        title: "Upcoming Session",
        body: `Your session is at ${new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        channelId: "reminders",
        schedule: { at: new Date(fireAt) },
      });
    });

  ls.set(storageKey, newIds);
  if (toSchedule.length > 0) {
    try { await plugin.schedule({ notifications: toSchedule }); } catch (e) { console.error("Failed to schedule session reminders:", e.message); }
  }
}

// Convenience wrapper for calling from schedule-loading pages (not just
// AuthContext's one-time login effect) — fetches the current preference
// itself, so callers just need to pass the userId and whatever bookings
// they already fetched.
export async function refreshSessionReminders(userId, bookings) {
  if (!userId) return;
  const { api } = await import("./api.js");
  try {
    const prefs = await api.get("/notification-preferences/me");
    await scheduleSessionReminders(userId, bookings, prefs?.sessionReminderMinutes ?? 60);
  } catch (e) { console.error("Failed to refresh session reminders:", e.message); }
}
