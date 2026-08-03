// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES — reminder settings, shared between coach and
// client Settings pages via one component. Session reminders apply to
// both roles; check-in/habit/nutrition/sync reminders are client-only
// activities, so this only shows that section when showClientReminders
// is true (passed by ClientSettingsPage, omitted by the coach's
// SettingsPage).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, Btn, Input } from "./ui.jsx";
import { scheduleDailyReminders, getPendingLocalReminders } from "../lib/localReminders.js";
import { useAuth } from "../context/AuthContext.jsx";

const REMINDER_TYPES = [
  { key: "checkin", label: "Check-in Reminder", desc: "A daily nudge to log a check-in with your coach" },
  { key: "habit", label: "Habit Reminder", desc: "A daily nudge to log today's habits" },
  { key: "nutrition", label: "Nutrition Reminder", desc: "A daily nudge to log your meals" },
  { key: "sync", label: "Sync Reminder", desc: "A nudge to open the app so your health data syncs", defaultOff: true },
];

export default function NotificationPreferencesCard({ showClientReminders = false }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [pendingReminders, setPendingReminders] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);

  const loadDebugInfo = async () => {
    setDebugLoading(true);
    const pending = await getPendingLocalReminders();
    setPendingReminders(pending);
    setDebugLoading(false);
  };

  useEffect(() => {
    api.get("/notification-preferences/me").then(setPrefs).catch(e => setError(e.message));
  }, []);

  const save = async () => {
    setSaving(true); setError("");
    try {
      const body = { sessionReminderMinutes: prefs.sessionReminderMinutes > 0 ? Math.max(1, Number(prefs.sessionReminderMinutes)) : 0 };
      if (showClientReminders) {
        for (const t of REMINDER_TYPES) {
          body[`${t.key}ReminderEnabled`] = prefs[`${t.key}ReminderEnabled`];
          body[`${t.key}ReminderTime`] = prefs[`${t.key}ReminderTime`];
        }
      }
      const updated = await api.put("/notification-preferences/me", body);
      setPrefs(updated);
      if (showClientReminders && user?.id) await scheduleDailyReminders(user.id, updated); // takes effect immediately, not just next login
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!prefs) return null;

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>🔔 Notifications</div>
      <div style={{ fontSize: 11, color: C.mt, marginBottom: 14 }}>Push notifications must be allowed for these to actually arrive — you'll be prompted the first time you log in on the app.</div>

      <div style={{ marginBottom: 14, paddingBottom: showClientReminders ? 14 : 0, borderBottom: showClientReminders ? `1px solid ${C.bd}` : "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.tx }}>Session Reminder</div>
            <div style={{ fontSize: 11, color: C.mt }}>A heads-up before your next session starts</div>
          </div>
          <button onClick={() => setPrefs({ ...prefs, sessionReminderMinutes: prefs.sessionReminderMinutes > 0 ? 0 : 60 })} style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: prefs.sessionReminderMinutes > 0 ? C.ac : C.s2, position: "relative", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: prefs.sessionReminderMinutes > 0 ? 21 : 3, transition: "left .15s" }} />
          </button>
        </div>
        {prefs.sessionReminderMinutes > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <Input type="number" min="1" value={prefs.sessionReminderMinutes} onChange={e => setPrefs({ ...prefs, sessionReminderMinutes: e.target.value === "" ? "" : +e.target.value })} onBlur={e => setPrefs(p => ({ ...p, sessionReminderMinutes: Math.max(1, Number(e.target.value) || 1) }))} style={{ width: 90 }} />
            <span style={{ fontSize: 12, color: C.mt }}>minutes before</span>
          </div>
        )}
      </div>

      {showClientReminders && REMINDER_TYPES.map(t => (
        <div key={t.key} style={{ marginBottom: 14, paddingTop: 14, borderTop: `1px solid ${C.bd}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.tx }}>{t.label}</div>
              <div style={{ fontSize: 11, color: C.mt }}>{t.desc}</div>
            </div>
            <button onClick={() => setPrefs({ ...prefs, [`${t.key}ReminderEnabled`]: !prefs[`${t.key}ReminderEnabled`] })} style={{ width: 42, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: prefs[`${t.key}ReminderEnabled`] ? C.ac : C.s2, position: "relative", flexShrink: 0 }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: prefs[`${t.key}ReminderEnabled`] ? 21 : 3, transition: "left .15s" }} />
            </button>
          </div>
          {prefs[`${t.key}ReminderEnabled`] && (
            <input type="time" value={prefs[`${t.key}ReminderTime`] || "08:00"} onChange={e => setPrefs({ ...prefs, [`${t.key}ReminderTime`]: e.target.value })}
              style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.bd}`, background: C.s2, color: C.tx, fontSize: 13, fontFamily: "inherit" }} />
          )}
        </div>
      ))}

      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginTop: 4 }}>{error}</div>}
      <Btn onClick={save} disabled={saving} style={{ width: "100%", marginTop: 12 }}>{saving ? "Saving…" : saved ? "✓ Saved!" : "Save Notification Settings"}</Btn>

      <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.bd}` }}>
        <button onClick={() => { const next = !showDebug; setShowDebug(next); if (next) loadDebugInfo(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.mt, padding: 0 }}>
          🔧 {showDebug ? "Hide" : "Show"} what's actually scheduled on this device
        </button>
        {showDebug && (
          <div style={{ marginTop: 10 }}>
            {debugLoading ? (
              <div style={{ fontSize: 11, color: C.mt }}>Checking…</div>
            ) : !pendingReminders || pendingReminders.length === 0 ? (
              <div style={{ fontSize: 11, color: C.mt }}>Nothing currently scheduled on this device.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {pendingReminders.map(n => (
                  <div key={n.id} style={{ fontSize: 11, color: C.tx, background: C.s2, borderRadius: 8, padding: "6px 8px" }}>
                    <div style={{ fontWeight: 600 }}>{n.title}</div>
                    <div style={{ color: C.mt }}>{typeof n.fireAt === "string" ? n.fireAt : new Date(n.fireAt).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={loadDebugInfo} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", fontSize: 10.5, color: C.ac, padding: 0 }}>↻ Refresh</button>
          </div>
        )}
      </div>
    </Card>
  );
}
