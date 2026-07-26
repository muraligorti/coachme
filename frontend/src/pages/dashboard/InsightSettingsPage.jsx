// ═══════════════════════════════════════════════════════════════════════
// INSIGHT SETTINGS — lets a coach tune the Daily Briefing / risk-flag
// thresholds to match how THEY actually coach. Backed by GET/PUT
// /api/insights/settings (see backend services/insightsService.js).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Card, Btn, ST, Empty, Spin } from "../../components/ui.jsx";

const INSIGHT_FIELDS = [
  { key: "workoutGapModerateDays", label: "Workout gap — worth a mention", unit: "days", desc: "No workout logged in this many days starts contributing to a risk flag (needs one more signal to actually flag)." },
  { key: "workoutGapSevereDays", label: "Workout gap — flag on its own", unit: "days", desc: "No workout logged in this many days flags the client by itself, no other signal needed." },
  { key: "nutritionGapDays", label: "Nutrition logging gap", unit: "days", desc: "No nutrition log in this many days contributes to a risk flag." },
  { key: "healthSyncGapDays", label: "Device sync gap", unit: "days", desc: "A connected device that hasn't synced in this many days contributes to a risk flag." },
  { key: "bookingDropModeratePct", label: "Booking drop — worth a mention", unit: "%", desc: "Booking frequency dropping this much vs. the client's own recent average contributes to a risk flag." },
  { key: "bookingDropSeverePct", label: "Booking drop — flag on its own", unit: "%", desc: "A drop this large flags the client by itself." },
  { key: "coldLeadDays", label: "Cold lead threshold", unit: "days", desc: "No follow-up on a lead in this many days marks it \"gone cold\" in your Daily Briefing." },
];

export default function InsightSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [bounds, setBounds] = useState({});
  const [defaults, setDefaults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api.get("/insights/settings")
      .then(r => { setSettings(r.settings); setBounds(r.bounds || {}); setDefaults(r.defaults || {}); })
      .catch(e => setLoadError(e.message || "Could not load settings"))
      .finally(() => setLoading(false));
  }, []);

  const update = (key, val) => { setSettings(s => ({ ...s, [key]: val })); setSaved(false); };
  const resetAll = () => { setSettings({ ...defaults }); setSaved(false); };
  const save = async () => {
    setSaving(true);
    try { const r = await api.put("/insights/settings", settings); setSettings(r.settings); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e) { alert("Failed to save: " + e.message); }
    setSaving(false);
  };

  if (loading) return <Spin />;
  if (!settings) return <div><ST>AI Insights Settings</ST><Empty icon="🧠" text={loadError ? `Couldn't load settings: ${loadError}` : "Insights are available for coach accounts only"} /></div>;

  return (
    <div>
      <ST>AI Insights Settings</ST>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ color: C.tx, fontSize: 13, lineHeight: 1.6 }}>Every coach runs their business differently — a twice-a-week bootcamp and a monthly check-in program have very different definitions of "gone quiet." Tune these thresholds so your Daily Briefing and client risk flags match how <b>you</b> actually coach.</div>
      </Card>
      {INSIGHT_FIELDS.map(f => {
        const b = bounds[f.key] || { min: 0, max: 100 };
        const val = settings[f.key] ?? defaults[f.key];
        return (
          <Card key={f.key} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <span style={{ color: C.tx, fontSize: 14, fontWeight: 600 }}>{f.label}</span>
              <span style={{ color: C.ac, fontSize: 16, fontWeight: 700 }}>{val}{f.unit === "%" ? "%" : ` ${f.unit}`}</span>
            </div>
            <div style={{ color: C.mt, fontSize: 11.5, marginBottom: 10, lineHeight: 1.4 }}>{f.desc}</div>
            <input type="range" min={b.min} max={b.max} value={val} onChange={e => update(f.key, +e.target.value)} style={{ width: "100%", accentColor: C.ac }} />
            <div style={{ display: "flex", justifyContent: "space-between", color: C.mt, fontSize: 10, marginTop: 2 }}><span>{b.min}</span><span>default: {defaults[f.key]}</span><span>{b.max}</span></div>
          </Card>
        );
      })}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Btn variant="secondary" onClick={resetAll} style={{ flex: 1 }}>↺ Reset to defaults</Btn>
        <Btn onClick={save} disabled={saving} style={{ flex: 1 }}>{saving ? "Saving…" : saved ? "✓ Saved" : "Save changes"}</Btn>
      </div>
    </div>
  );
}
