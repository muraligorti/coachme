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
// Explicitly IST, regardless of what timezone the server's own clock is
// set to (Railway defaults to UTC) — this app's users are India-based,
// so reminder times configured as "18:00" mean 6pm IST, not 6pm wherever
// the server happens to think it is. Using Intl's timezone conversion
// rather than a manual UTC+5:30 offset so this stays correct even across
// any DST-like edge cases (India doesn't observe DST, but this is the
// more robust way to express "IST" than hardcoded arithmetic).
function nowMinutesIST() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const h = Number(parts.find(p => p.type === "hour").value);
  const m = Number(parts.find(p => p.type === "minute").value);
  return h * 60 + m;
}
function todayDateStrIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()); // en-CA gives YYYY-MM-DD directly
}

// Is the configured HH:MM within the last SCAN_WINDOW_MINUTES of now?
// (i.e. would a cron run right now be the first one to notice it's time)
function isTimeDue(hhmm) {
  const target = toMinutes(hhmm);
  const now = nowMinutesIST();
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
  let sent = 0, checked = 0;
  for (const pref of rows) {
    if (pref.user.role !== "CLIENT") continue; // these four are client-oriented activities, regardless of who might have a row
    checked++;
    const timeField = `${type}ReminderTime`, lastField = `last${type[0].toUpperCase()}${type.slice(1)}ReminderDate`;
    if (!isTimeDue(pref[timeField])) continue;
    if (pref[lastField] === todayDateStrIST()) continue; // already sent today
    await sendPushToUser(pref.userId, { title, body: bodyFn(), data: { type: `reminder_${type}` } });
    await repo.markDailyReminderSent(pref.userId, type, todayDateStrIST());
    sent++;
  }
  return { sent, checked };
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
  return { sent, checked: bookings.length };
}

export async function runReminderScan() {
  // Session/check-in/habit/nutrition/sync reminders are now scheduled
  // client-side, on-device (see frontend/src/lib/localReminders.js) —
  // more reliable than this server cron for personal recurring
  // reminders (no timezone conversion needed, no dependency on GitHub
  // Actions' schedule trigger being exactly on time). Actually sending
  // from here too would double-notify. The scan logic below is left in
  // place, structurally intact but not invoked, in case server-side
  // sending becomes useful again for some future case (e.g. a web-only
  // client without local notification support) — not deleted outright.
  return { note: "Reminder sending moved client-side — see localReminders.js. This endpoint is now a no-op.", session: { sent: 0, checked: 0 }, checkin: { sent: 0, checked: 0 }, habit: { sent: 0, checked: 0 }, nutrition: { sent: 0, checked: 0 }, sync: { sent: 0, checked: 0 } };
}
