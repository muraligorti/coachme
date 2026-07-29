// ═══════════════════════════════════════════════════════════════════════
// EXERCISE TREND CHART — pick a logged exercise, see weight/reps
// progression over every recorded session (from LiveSessionPage's
// AI-parsed logs, or any manually-logged WorkoutSession). Same SVG
// trend-line approach ProgressTracker.jsx already uses for body
// measurements, applied here to exercise performance instead.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, Empty, Spin } from "../components/ui.jsx";

function TrendLine({ data, field, label, color, unit }) {
  const points = data.filter((d) => d[field] !== null && d[field] !== undefined);
  if (points.length < 2) return null;
  const vals = points.map((p) => p[field]);
  const min = Math.min(...vals); const max = Math.max(...vals); const range = max - min || 1;
  const width = Math.max(points.length * 30, 200);

  return (
    <Card style={{ padding: 14, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: vals[vals.length - 1] > vals[0] ? C.ok : vals[vals.length - 1] < vals[0] ? C.wn : C.mt }}>
          {vals[0]}{unit} → {vals[vals.length - 1]}{unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} 80`} style={{ width: "100%", height: 80 }}>
        {[0, 1, 2, 3].map((i) => <line key={i} x1="0" y1={i * 20 + 10} x2={width} y2={i * 20 + 10} stroke={C.bd} strokeWidth="0.5" />)}
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          points={points.map((p, i) => { const x = i * (width / (points.length - 1)); const y = 70 - ((p[field] - min) / range) * 60; return `${x},${y}`; }).join(" ")} />
        {points.map((p, i) => {
          const x = i * (width / (points.length - 1)); const y = 70 - ((p[field] - min) / range) * 60;
          return <circle key={i} cx={x} cy={y} r="3.5" fill={color} stroke={C.sf} strokeWidth="1.5"><title>{new Date(p.date).toLocaleDateString()}: {p[field]}{unit}</title></circle>;
        })}
      </svg>
    </Card>
  );
}

export default function ExerciseTrendChart({ clientId }) {
  const [exerciseNames, setExerciseNames] = useState([]);
  const [selected, setSelected] = useState("");
  const [history, setHistory] = useState([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/exercise-trends/${clientId}/exercises`)
      .then((r) => { const names = r.exercises || []; setExerciseNames(names); if (names.length) setSelected(names[0]); })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingNames(false));
  }, [clientId]);

  useEffect(() => {
    if (!selected) return;
    setLoadingHistory(true);
    api.get(`/exercise-trends/${clientId}/${encodeURIComponent(selected)}/history`)
      .then((r) => setHistory(r.history || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingHistory(false));
  }, [clientId, selected]);

  if (loadingNames) return <Spin />;
  if (error) return <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>;
  if (exerciseNames.length === 0) return <Empty icon="📈" text="No logged exercises yet — trends will appear here once a Live Session or manual log records some." />;

  const qualityIcon = { 1: "😞", 2: "😐", 3: "🙂", 4: "💪" };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {exerciseNames.map((name) => (
          <button key={name} onClick={() => setSelected(name)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: selected === name ? C.ac : C.s2, color: selected === name ? "#fff" : C.mt }}>{name}</button>
        ))}
      </div>
      {loadingHistory ? <Spin /> : history.length < 2 ? (
        <Empty icon="📈" text={`Need at least 2 logged sessions of "${selected}" to show a trend — keep logging!`} />
      ) : (
        <div>
          <TrendLine data={history} field="weight" label="Weight" color={C.ac} unit="kg" />
          <TrendLine data={history} field="reps" label="Reps" color={C.a2} unit="" />
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, margin: "16px 0 8px" }}>History</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {history.slice().reverse().map((h) => (
              <Card key={h.id} style={{ padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, minWidth: 70 }}>{new Date(h.date).toLocaleDateString()}</div>
                <div style={{ flex: 1, fontSize: 12, color: C.mt }}>{h.sets}×{h.reps}{h.weightLabel ? ` @ ${h.weightLabel}` : ""}</div>
                {h.formScore && <span style={{ fontSize: 16 }}>{qualityIcon[h.formScore]}</span>}
                {h.formNotes && <span style={{ fontSize: 11, color: C.ac, fontStyle: "italic", maxWidth: "35%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.formNotes}>🎙️ {h.formNotes}</span>}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
