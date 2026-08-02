// ═══════════════════════════════════════════════════════════════════════
// LOCAL REMINDERS — session/check-in/habit/nutrition/sync reminders are
// scheduled entirely on-device using the device's own clock, not
// triggered by a server-side cron. This is deliberately different from
// push notifications: no server round-trip needed at the trigger moment,
// no timezone conversion needed (the device's clock IS the correct
// timezone for "remind me at MY 6pm"), and no dependency on a
// third-party scheduler's timing being exact.
//
// Event-driven notifications (like "a client requested a cancellation")
// are NOT part of this — those still go through real push, since they
// react to someone else's action and this device has no way to know
// about that on its own. See pushService.js on the backend for those.
//
// ID ranges, so re-scheduling can cleanly cancel-and-recreate without
// accumulating duplicates or leftovers:
//   1000-1099: daily reminders (checkin/habit/nutrition/sync), one fixed
//              ID per type
//   2000+:     session reminders, one per currently-known upcoming
//              booking, IDs tracked in localStorage so stale ones (from
//              a cancelled/rescheduled booking) get cancelled properly
// ═══════════════════════════════════════════════════════════════════════
import { Capacitor } from "@capacitor/core";
import { ls } from "./storage.js";

const DAILY_IDS = { checkin: 1001, habit: 1002, nutrition: 1003, sync: 1004 };
const DAILY_TITLES = {
  checkin: { title: "Check-in Reminder", body: "How's your day going? Log a quick check-in with your coach." },
  habit: { title: "Habit Reminder", body: "Don't forget to log today's habits!" },
  nutrition: { title: "Nutrition Reminder", body: "Time to log your meals for today." },
  sync: { title: "Sync Reminder", body: "Open the app to sync your latest health data." },
};

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

// Schedules (or re-schedules) the four repeating daily reminders based
// on the user's current preferences — call this on login and again
// immediately after saving Settings, so a change takes effect right away
// rather than waiting for the next app restart.
export async function scheduleDailyReminders(prefs) {
  const plugin = await getPlugin();
  if (!plugin || !prefs) return;

  // Cancel all four first, unconditionally — simplest way to guarantee
  // no stale/duplicate schedule survives a preference change (e.g.
  // toggling a reminder off, or changing its time).
  try { await plugin.cancel({ notifications: Object.values(DAILY_IDS).map(id => ({ id })) }); } catch {}

  const toSchedule = [];
  for (const type of ["checkin", "habit", "nutrition", "sync"]) {
    if (!prefs[`${type}ReminderEnabled`]) continue;
    const [hour, minute] = (prefs[`${type}ReminderTime`] || "08:00").split(":").map(Number);
    toSchedule.push({
      id: DAILY_IDS[type],
      title: DAILY_TITLES[type].title,
      body: DAILY_TITLES[type].body,
      channelId: "reminders",
      schedule: { on: { hour, minute }, allowWhileIdle: true }, // "on: {hour,minute}" repeats daily at that time, using the device's own local time
    });
  }
  if (toSchedule.length > 0) {
    try { await plugin.schedule({ notifications: toSchedule }); } catch (e) { console.error("Failed to schedule daily reminders:", e.message); }
  }
}

// Schedules one-time reminders for each upcoming confirmed booking, at
// (scheduledAt - leadMinutes) in the device's own local time. Call this
// whenever the schedule is loaded/refreshed, so cancelled/rescheduled
// bookings don't leave stale reminders behind.
export async function scheduleSessionReminders(bookings, leadMinutes) {
  const plugin = await getPlugin();
  if (!plugin) return;

  const previousIds = ls.get("scheduled_session_reminder_ids", []);
  if (previousIds.length > 0) {
    try { await plugin.cancel({ notifications: previousIds.map(id => ({ id })) }); } catch {}
  }

  if (!leadMinutes || leadMinutes <= 0 || !Array.isArray(bookings)) { ls.set("scheduled_session_reminder_ids", []); return; }

  const now = Date.now();
  const toSchedule = [];
  const newIds = [];
  bookings
    .filter(b => (b.status || "").toUpperCase() === "CONFIRMED")
    .forEach((b, i) => {
      const start = new Date(b.scheduledAt || b.date).getTime();
      const fireAt = start - leadMinutes * 60000;
      if (fireAt <= now) return; // reminder time already passed, or the session is sooner than the lead time — nothing to schedule
      const id = 2000 + i; // stable within one scheduling pass; fully replaced (cancel-all-then-recreate) on every call, so reuse across calls doesn't matter
      newIds.push(id);
      toSchedule.push({
        id,
        title: "Upcoming Session",
        body: `Your session is at ${new Date(start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        channelId: "reminders",
        schedule: { at: new Date(fireAt) },
      });
    });

  ls.set("scheduled_session_reminder_ids", newIds);
  if (toSchedule.length > 0) {
    try { await plugin.schedule({ notifications: toSchedule }); } catch (e) { console.error("Failed to schedule session reminders:", e.message); }
  }
}
