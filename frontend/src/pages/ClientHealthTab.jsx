// ═══════════════════════════════════════════════════════════════════════
// CLIENT HEALTH TAB — a coach's read-only view of one client's shared
// fitness/health data, surfaced directly inside their profile (alongside
// Workouts/Progress/Habits/Nutrition/Check-ins) rather than requiring a
// separate trip to the Fitness Devices screen and re-selecting the client.
// Reuses the same GET /health-data/client/:clientId endpoint the
// standalone Fitness Devices page's coach view already calls.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, Empty, Spin } from "../components/ui.jsx";

export default function ClientHealthTab({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/health-data/client/${clientId}`)
      .then(d => setData(d.data || d || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [clientId]);

  if (loading) return <Spin />;
  if (error) return <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>;
  if (!data || data.length === 0) return <Empty icon="⌚" text="This client hasn't shared any health/fitness data yet." />;

  const latest = [...data].sort((a, b) => b.date.localeCompare(a.date))[0];
  const metrics = [
    { l: "Steps", v: latest.steps?.toLocaleString(), icon: "🚶", c: C.ac },
    { l: "Calories", v: latest.caloriesBurned, icon: "🔥", c: C.or },
    { l: "Avg HR", v: latest.heartRateAvg ? `${latest.heartRateAvg} bpm` : null, icon: "❤️", c: C.dg },
    { l: "Resting HR", v: latest.restingHeartRate ? `${latest.restingHeartRate} bpm` : null, icon: "💤", c: C.dg },
    { l: "Sleep", v: latest.sleepHours ? `${latest.sleepHours}h` : null, icon: "😴", c: C.ac },
    { l: "SpO2", v: latest.spo2 ? `${latest.spo2}%` : null, icon: "🫁", c: C.a2 },
    { l: "HRV", v: latest.heartRateVariability ? `${latest.heartRateVariability}ms` : null, icon: "📈", c: C.a2 },
    { l: "Body Fat", v: latest.bodyFat ? `${latest.bodyFat}%` : null, icon: "⚖️", c: C.pk },
    { l: "Weight", v: latest.weight ? `${latest.weight}kg` : null, icon: "⚖️", c: C.pk },
    { l: "Workouts", v: latest.workoutCount ? `${latest.workoutCount} (${latest.workoutMinutes}min)` : null, icon: "🏋️", c: C.ok },
  ].filter(m => m.v);

  return (
    <div>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Latest ({latest.date})</div>
          <span style={{ fontSize: 10, color: C.mt }}>Source: {latest.source}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {metrics.map(m => (
            <div key={m.l} style={{ textAlign: "center", padding: 8, background: C.s2, borderRadius: 10 }}>
              <div style={{ fontSize: 16 }}>{m.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: m.c }}>{m.v}</div>
              <div style={{ fontSize: 10, color: C.mt }}>{m.l}</div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 8 }}>Recent History</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[...data].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map((d, i) => (
          <Card key={i} style={{ padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, minWidth: 56 }}>{d.date.slice(5)}</div>
            <div style={{ flex: 1, display: "flex", gap: 10, fontSize: 11, color: C.mt, flexWrap: "wrap" }}>
              {d.steps > 0 && <span>🚶{d.steps.toLocaleString()}</span>}
              {d.caloriesBurned > 0 && <span>🔥{d.caloriesBurned}</span>}
              {d.heartRateAvg > 0 && <span>❤️{d.heartRateAvg}</span>}
              {d.sleepHours > 0 && <span>😴{d.sleepHours}h</span>}
              {d.workoutCount > 0 && <span>🏋️{d.workoutCount}</span>}
            </div>
            <span style={{ fontSize: 10, color: C.mt }}>{d.source}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
