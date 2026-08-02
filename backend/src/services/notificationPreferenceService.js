// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCE SERVICE — a user's own reminder settings, plus
// runReminderScan(): the function a scheduled job calls periodically
// (see routes/notificationPreferences.js's protected /run-reminders
// endpoint, triggered by a GitHub Actions cron every 15 minutes — see
// .github/workflows/send-reminders.yml).
//
// v1 scope, stated plainly: daily reminders (check-in/habit/nutrition/
// sync) fire at the configured time regardless of whether the action was
// already completed that day — not smart enough yet to check completion
// first. A reasonable next refinement, not silently promised now.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import * as repo from "../repositories/notificationPreferenceRepository.js";
import { sendPushToUser } from "./pushService.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const SCAN_WINDOW_MINUTES = 15; // must match the cron schedule's interval

function toMinutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function nowMinutesLocal() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
function todayDateStr() { return new Date().toISOString().slice(0, 10); }

// Is the configured HH:MM within the last SCAN_WINDOW_MINUTES of now?
// (i.e. would a cron run right now be the first one to notice it's time)
function isTimeDue(hhmm) {
  const target = toMinutes(hhmm);
  const now = nowMinutesLocal();
  const diff = now - target;
  return diff >= 0 && diff < SCAN_WINDOW_MINUTES;
}

export async function getMyPreferences(userId) {
  const existing = await repo.findByUserId(userId);
  if (existing) return existing;
  return repo.upsertPreference(userId, {}); // creates a row with schema defaults on first access
}

export async function updateMyPreferences(userId, data) {
  const updates = {};
  if (data.sessionReminderMinutes !== undefined) {
    const m = Number(data.sessionReminderMinutes);
    if (!Number.isInteger(m) || m < 0 || m > 1440) throw new AppError(400, "sessionReminderMinutes must be 0-1440");
    updates.sessionReminderMinutes = m;
  }
  for (const type of ["checkin", "habit", "nutrition", "sync"]) {
    const enabledKey = `${type}ReminderEnabled`, timeKey = `${type}ReminderTime`;
    if (data[enabledKey] !== undefined) updates[enabledKey] = !!data[enabledKey];
    if (data[timeKey] !== undefined) {
      if (!TIME_RE.test(data[timeKey])) throw new AppError(400, `${timeKey} must be in HH:MM 24-hour format`);
      updates[timeKey] = data[timeKey];
    }
  }
  if (Object.keys(updates).length === 0) throw new AppError(400, "No valid preference fields provided");
  return repo.upsertPreference(userId, updates);
}

// ── The reminder scan itself ────────────────────────────────────────

async function runDailyReminderType(type, title, bodyFn) {
  const rows = await repo.findEnabledForType(type);
  let sent = 0;
  for (const pref of rows) {
    if (pref.user.role !== "CLIENT") continue; // these four are client-oriented activities, regardless of who might have a row
    const timeField = `${type}ReminderTime`, lastField = `last${type[0].toUpperCase()}${type.slice(1)}ReminderDate`;
    if (!isTimeDue(pref[timeField])) continue;
    if (pref[lastField] === todayDateStr()) continue; // already sent today
    await sendPushToUser(pref.userId, { title, body: bodyFn(), data: { type: `reminder_${type}` } });
    await repo.markDailyReminderSent(pref.userId, type, todayDateStr());
    sent++;
  }
  return sent;
}

async function runSessionReminders() {
  const now = new Date();
  const bookings = await repo.findBookingsPendingReminder(now);
  let sent = 0;
  for (const b of bookings) {
    const minutesUntil = Math.round((new Date(b.scheduledAt) - now) / 60000);
    const timeLabel = new Date(b.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    if (!b.clientReminderSentAt && b.client) {
      const pref = await repo.findByUserId(b.client.userId);
      const leadMinutes = pref?.sessionReminderMinutes ?? 60;
      if (leadMinutes > 0 && minutesUntil <= leadMinutes && minutesUntil >= leadMinutes - SCAN_WINDOW_MINUTES) {
        await sendPushToUser(b.client.userId, { title: "Upcoming Session", body: `Your session is at ${timeLabel}`, data: { bookingId: b.id, type: "session_reminder" } });
        await repo.markClientReminderSent(b.id);
        sent++;
      }
    }
    if (!b.coachReminderSentAt && b.coach) {
      const pref = await repo.findByUserId(b.coach.userId);
      const leadMinutes = pref?.sessionReminderMinutes ?? 60;
      if (leadMinutes > 0 && minutesUntil <= leadMinutes && minutesUntil >= leadMinutes - SCAN_WINDOW_MINUTES) {
        await sendPushToUser(b.coach.userId, { title: "Upcoming Session", body: `Session with ${b.client?.displayName || "a client"} at ${timeLabel}`, data: { bookingId: b.id, type: "session_reminder" } });
        await repo.markCoachReminderSent(b.id);
        sent++;
      }
    }
  }
  return sent;
}

export async function runReminderScan() {
  const results = {
    session: await runSessionReminders(),
    checkin: await runDailyReminderType("checkin", "Check-in Reminder", () => "How's your day going? Log a quick check-in with your coach."),
    habit: await runDailyReminderType("habit", "Habit Reminder", () => "Don't forget to log today's habits!"),
    nutrition: await runDailyReminderType("nutrition", "Nutrition Reminder", () => "Time to log your meals for today."),
    sync: await runDailyReminderType("sync", "Sync Reminder", () => "Open the app to sync your latest health data."),
  };
  return results;
}
