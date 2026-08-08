// ═══════════════════════════════════════════════════════════════════════
// CLIENT PROGRESS — combines the client's logged workout sessions with
// their check-in history (mood/energy/sleep/stress/weight/adherence).
// Check-ins used to be a separate standalone tab; folded in here since
// they're the same underlying "progress" concept and check-in data is
// what actually drives the weight/adherence trend shown at the top.
//
// GET /checkins already returns every check-in for this client
// regardless of who submitted it - a coach logging one live during a
// session and a client logging their own look identical in the data,
// so anything a coach enters here is automatically visible to the
// client too, with no separate wiring needed.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Card, Btn, SC, Empty, ST, Modal, Spin } from "../../components/ui.jsx";
import CheckInForm, { MOODS } from "../../components/CheckInForm.jsx";

export default function ClientProgressPage() {
  const [sessions, setSessions] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ energy: 7, sleep: 7, stress: 3, adherence: 80, weight: "", notes: "", mood: "good" });

  useEffect(() => {
    Promise.all([
      api.get("/workouts/sessions").then(d => Array.isArray(d) ? d : d.data || []).catch(() => []),
      api.get("/checkins").then(r => r.checkIns || []).catch(() => []),
    ]).then(([s, c]) => { setSessions(s); setCheckIns(c); }).finally(() => setLoading(false));
  }, []);

  const submitCheckIn = async () => {
    try {
      const saved = await api.post("/checkins", form);
      setCheckIns(prev => [saved, ...prev.filter(c => c.date !== saved.date)]);
      setShowForm(false);
    } catch (e) { alert("Could not submit check-in: " + e.message); }
  };

  if (loading) return <Spin />;

  const byDate = {};
  sessions.forEach(s => { const d = new Date(s.completedAt).toISOString().slice(0, 10); if (!byDate[d]) byDate[d] = []; byDate[d].push(s); });
  const workoutDates = Object.keys(byDate).sort().reverse().slice(0, 14);

  // Same derived trend as the coach's per-client check-in view - weight
  // needs at least 2 logged points to show a real trend, not just a
  // single number.
  const weighedIns = checkIns.filter(c => c.weight != null).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstWeight = weighedIns[0]?.weight;
  const latestWeight = weighedIns[weighedIns.length - 1]?.weight;
  const weightDelta = (firstWeight != null && latestWeight != null && weighedIns.length > 1) ? +(latestWeight - firstWeight).toFixed(1) : null;
  const avgAdherence = checkIns.length > 0 ? Math.round(checkIns.reduce((sum, c) => sum + (c.adherence ?? 0), 0) / (checkIns.filter(c => c.adherence != null).length || 1)) || null : null;

  return (
    <div>
      <ST right={<Btn onClick={() => setShowForm(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Check-in</Btn>}>My Progress</ST>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <SC label="Total Sessions" value={sessions.length} icon="💪" color={C.ac} />
        <SC label="This Week" value={sessions.filter(s => new Date(s.completedAt) >= new Date(Date.now() - 7 * 86400000)).length} icon="📅" color={C.ok} />
        <SC label="Exercises" value={[...new Set(sessions.map(s => s.exerciseName))].length} icon="🏋️" color={C.a2} />
      </div>

      {(weightDelta !== null || avgAdherence !== null) && (
        <Card style={{ padding: 14, marginBottom: 16, display: "flex", gap: 20 }}>
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

      {checkIns.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.mt, marginBottom: 8 }}>Check-in History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {checkIns.slice(0, 10).map(c => (
              <Card key={c.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{c.date}</div>
                  <span style={{ fontSize: 20 }}>{MOODS.find(m => m.v === c.mood)?.e || "🙂"}</span>
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
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: C.mt, marginBottom: 8 }}>Workout Sessions</div>
      {workoutDates.length === 0 ? <Empty icon="💪" text="No workout sessions yet. Your coach will log them during sessions." /> : workoutDates.map(d => (
        <div key={d} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.mt, marginBottom: 6 }}>{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</div>
          {byDate[d].map(s => (
            <Card key={s.id} style={{ padding: 12, marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{s.exerciseName}</div><div style={{ fontSize: 12, color: C.mt }}>{s.sets}×{s.reps}{s.intensity ? ` @ ${s.intensity}` : ""}</div></div>
                {s.notes && <div style={{ fontSize: 11, color: C.mt, maxWidth: "40%", textAlign: "right" }}>{s.notes}</div>}
              </div>
            </Card>
          ))}
        </div>
      ))}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Weekly Check-in">
        <CheckInForm form={form} setForm={setForm} onSubmit={submitCheckIn} />
      </Modal>
    </div>
  );
}
