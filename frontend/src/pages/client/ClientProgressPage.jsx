// ═══════════════════════════════════════════════════════════════════════
// CLIENT PROGRESS — a client's own logged workout sessions, grouped by
// date. Read-only from the client's side (coaches log sessions).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Card, SC, Empty, ST, Spin } from "../../components/ui.jsx";

export default function ClientProgressPage() {
  const [sessions, setSessions] = useState([]); const [loading, setLoading] = useState(true);
  useEffect(() => { api.get("/workouts/sessions").then(d => { const s = Array.isArray(d) ? d : d.data || []; setSessions(s); }).catch(() => {}).finally(() => setLoading(false)); }, []);
  if (loading) return <Spin />;
  const byDate = {}; sessions.forEach(s => { const d = new Date(s.completedAt).toISOString().slice(0, 10); if (!byDate[d]) byDate[d] = []; byDate[d].push(s); });
  const dates = Object.keys(byDate).sort().reverse().slice(0, 14);
  return (
    <div>
      <ST>My Progress</ST>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <SC label="Total Sessions" value={sessions.length} icon="💪" color={C.ac} />
        <SC label="This Week" value={sessions.filter(s => new Date(s.completedAt) >= new Date(Date.now() - 7 * 86400000)).length} icon="📅" color={C.ok} />
        <SC label="Exercises" value={[...new Set(sessions.map(s => s.exerciseName))].length} icon="🏋️" color={C.a2} />
      </div>
      {dates.length === 0 ? <Empty icon="💪" text="No workout sessions yet. Your coach will log them during sessions." /> : dates.map(d => (
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
    </div>
  );
}
