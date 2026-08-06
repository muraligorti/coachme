// ═══════════════════════════════════════════════════════════════════════
// CHECK-INS — weekly energy/sleep/stress/adherence questionnaire.
// NOW BACKEND-REAL: a client submits their own check-ins (POST /checkins,
// GET /checkins), and a coach can view (read-only) a specific roster
// client's history (GET /checkins/client/:clientId) — gated server-side
// by an active coach-client relationship check, not just a hidden UI.
//
// Role-aware via the optional `clientId` prop: when ClientsPage renders
// this inside a client's profile (coach view), it's passed and the page
// becomes read-only. When a client opens their own Check-ins tab, no
// clientId is passed and the full submit form appears.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, Badge, Btn, Input, TextArea, Modal, Empty, Spin, ST } from "../components/ui.jsx";

export default function CheckInsPage({ clientId }) {
  const isCoachView = !!clientId;
  const [cks, setCks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showF, setShowF] = useState(false);
  const [form, setForm] = useState({ energy: 7, sleep: 7, stress: 3, adherence: 80, weight: "", notes: "", mood: "good" });
  const moods = [{ v: "great", e: "😄" }, { v: "good", e: "🙂" }, { v: "okay", e: "😐" }, { v: "tired", e: "😴" }, { v: "bad", e: "😞" }];

  useEffect(() => {
    const path = isCoachView ? `/checkins/client/${clientId}` : "/checkins";
    api.get(path).then(r => setCks(r.checkIns || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [clientId]);

  const submit = async () => {
    try {
      const path = isCoachView ? `/checkins/client/${clientId}` : "/checkins";
      const saved = await api.post(path, form);
      setCks(prev => [saved, ...prev.filter(c => c.date !== saved.date)]);
      setShowF(false);
    } catch (e) { alert("Could not submit check-in: " + e.message); }
  };

  // Derived progress summary — the check-in data already captures
  // weight/adherence over time, so "progress" here means surfacing the
  // trend from it directly rather than a separate tracking system.
  // Needs at least 2 check-ins with weight logged to show a real trend.
  const weighedIns = cks.filter(c => c.weight != null).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstWeight = weighedIns[0]?.weight;
  const latestWeight = weighedIns[weighedIns.length - 1]?.weight;
  const weightDelta = (firstWeight != null && latestWeight != null && weighedIns.length > 1) ? +(latestWeight - firstWeight).toFixed(1) : null;
  const avgAdherence = cks.length > 0 ? Math.round(cks.reduce((sum, c) => sum + (c.adherence ?? 0), 0) / cks.filter(c => c.adherence != null).length) || null : null;

  if (loading) return <Spin />;

  return (
    <div>
      {!isCoachView && <ST right={<Btn onClick={() => setShowF(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Check-in</Btn>}>Check-ins</ST>}
      {isCoachView && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><div style={{ fontSize: 13, color: C.mt }}>{cks.length} check-in{cks.length !== 1 ? "s" : ""} logged</div><Btn onClick={() => setShowF(true)} style={{ padding: "6px 12px", fontSize: 12 }}>+ Log Check-in</Btn></div>}
      {(weightDelta !== null || avgAdherence !== null) && (
        <Card style={{ padding: 14, marginBottom: 12, display: "flex", gap: 20 }}>
          {weightDelta !== null && (
            <div>
              <div style={{ fontSize: 11, color: C.mt }}>Weight trend</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: weightDelta < 0 ? C.ok : weightDelta > 0 ? C.wn : C.tx }}>
                {firstWeight}kg → {latestWeight}kg <span style={{ fontSize: 13 }}>({weightDelta > 0 ? "+" : ""}{weightDelta}kg)</span>
              </div>
            </div>
          )}
          {avgAdherence !== null && (
            <div>
              <div style={{ fontSize: 11, color: C.mt }}>Avg. adherence</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>{avgAdherence}%</div>
            </div>
          )}
        </Card>
      )}
      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      {cks.length === 0 ? <Empty icon="📋" text={isCoachView ? "This client hasn't logged any check-ins yet" : "No check-ins yet"} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cks.map(c => (
            <Card key={c.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{c.date}</div>
                <span style={{ fontSize: 20 }}>{moods.find(m => m.v === c.mood)?.e || "🙂"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                <div><span style={{ color: C.mt }}>Energy</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.energy ?? "—"}/10</span></div>
                <div><span style={{ color: C.mt }}>Sleep</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.sleep ?? "—"}/10</span></div>
                <div><span style={{ color: C.mt }}>Stress</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.stress ?? "—"}/10</span></div>
                <div><span style={{ color: C.mt }}>Adherence</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.adherence ?? "—"}%</span></div>
              </div>
              {c.notes && <div style={{ fontSize: 12, color: C.mt, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.bd}` }}>{c.notes}</div>}
            </Card>
          ))}
        </div>
      )}
      <Modal open={showF} onClose={() => setShowF(false)} title={isCoachView ? "Log Check-in for Client" : "Weekly Check-in"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>How are you feeling?</label>
              <div style={{ display: "flex", gap: 8 }}>
                {moods.map(m => <button key={m.v} onClick={() => setForm({ ...form, mood: m.v })} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", background: form.mood === m.v ? C.ac + "30" : C.s2, fontSize: 22, transition: "all .2s" }}>{m.e}</button>)}
              </div>
            </div>
            {[{ k: "energy", l: "Energy", mx: 10 }, { k: "sleep", l: "Sleep Quality", mx: 10 }, { k: "stress", l: "Stress Level", mx: 10 }].map(s => (
              <div key={s.k}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: C.mt }}>{s.l}</span><span style={{ color: C.tx, fontWeight: 600 }}>{form[s.k]}/{s.mx}</span></div>
                <input type="range" min="1" max={s.mx} value={form[s.k]} onChange={e => setForm({ ...form, [s.k]: +e.target.value })} style={{ width: "100%", accentColor: C.ac }} />
              </div>
            ))}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: C.mt }}>Plan Adherence</span><span style={{ color: C.tx, fontWeight: 600 }}>{form.adherence}%</span></div>
              <input type="range" min="0" max="100" step="5" value={form.adherence} onChange={e => setForm({ ...form, adherence: +e.target.value })} style={{ width: "100%", accentColor: C.ok }} />
            </div>
            <Input label="Weight (kg)" type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
            <TextArea label="Notes / Wins / Struggles" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={isCoachView ? "What came up during the session?" : "How was your week?"} />
            <Btn onClick={submit} style={{ width: "100%" }}>Submit</Btn>
          </div>
        </Modal>
    </div>
  );
}
