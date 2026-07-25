// ═══════════════════════════════════════════════════════════════════════
// PROGRESS TRACKER — body measurements (weight, BMI, body fat, and 10+
// circumference metrics), merged with device-synced weight and check-in
// weight data, shown as overview stats, SVG trend lines, and history.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { C } from "../theme/theme.js";
import { ls } from "../lib/storage.js";
import { Card, Badge, Btn, Input, TextArea, Modal, Empty, Tabs } from "../components/ui.jsx";

export default function ProgressTracker({ cid }) {
  const [entries, setEntries] = useState(ls.get(`prog_${cid}`, []));
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState("overview");
  const [activeMetric, setActiveMetric] = useState("weight");
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), weight: "", height: "", bodyFat: "", chest: "", waist: "", hips: "", bicepsL: "", bicepsR: "", thighL: "", thighR: "", calves: "", shoulders: "", neck: "", forearm: "", notes: "" });
  const emptyForm = { date: new Date().toISOString().slice(0, 10), weight: "", height: "", bodyFat: "", chest: "", waist: "", hips: "", bicepsL: "", bicepsR: "", thighL: "", thighR: "", calves: "", shoulders: "", neck: "", forearm: "", notes: "" };

  const deviceData = ls.get("device_data", []).filter(d => d.weight > 0);
  const checkins = ls.get(`checkins`, []);
  const allEntries = useMemo(() => {
    const merged = [...entries];
    deviceData.forEach(d => {
      if (d.weight && !merged.some(e => e.date === d.date && e.source === "device")) {
        merged.push({ id: `dev_${d.date}`, date: d.date, weight: d.weight, source: "device", heartRateAvg: d.heartRateAvg, steps: d.steps, sleepHours: d.sleepHours, spo2: d.spo2 });
      }
    });
    checkins.forEach(c => {
      if (c.weight && !merged.some(e => e.date === c.date && e.source === "checkin")) {
        merged.push({ id: `ck_${c.date}`, date: c.date, weight: c.weight, source: "checkin", energy: c.energy, sleep: c.sleep, adherence: c.adherence, mood: c.mood });
      }
    });
    return merged.sort((a, b) => a.date.localeCompare(b.date));
  }, [entries, deviceData.length, checkins.length]);

  const save = () => {
    const entry = { ...form, id: Date.now(), source: "manual" };
    ["weight", "height", "bodyFat", "chest", "waist", "hips", "bicepsL", "bicepsR", "thighL", "thighR", "calves", "shoulders", "neck", "forearm"].forEach(k => { entry[k] = +entry[k] || 0; });
    if (entry.weight && entry.height) { entry.bmi = +(entry.weight / ((entry.height / 100) ** 2)).toFixed(1); }
    const u = [...entries, entry]; setEntries(u); ls.set(`prog_${cid}`, u);
    setShowAdd(false); setForm(emptyForm);
  };

  const importFromDevice = () => {
    const dData = ls.get("device_data", []);
    const latest = dData.sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest) setForm(f => ({ ...f, weight: String(latest.weight || ""), date: latest.date || f.date }));
    else alert("No device data found. Connect a fitness device first.");
  };

  const lat = allEntries[allEntries.length - 1];
  const prev = allEntries.length > 1 ? allEntries[allEntries.length - 2] : null;
  const currentBMI = lat?.bmi || (lat?.weight && lat?.height ? (lat.weight / ((lat.height / 100) ** 2)).toFixed(1) : null);
  const bmiCategory = currentBMI ? (currentBMI < 18.5 ? "Underweight" : currentBMI < 25 ? "Normal" : currentBMI < 30 ? "Overweight" : "Obese") : null;
  const bmiColor = currentBMI ? (currentBMI < 18.5 ? C.wn : currentBMI < 25 ? C.ok : currentBMI < 30 ? C.wn : C.dg) : C.mt;

  const diff = (field) => { if (!lat || !prev) return null; const v = +(lat[field] || 0) - (+(prev[field] || 0)); return v === 0 ? null : v; };

  const metrics = [
    { id: "weight", label: "Weight", unit: "kg", color: C.ac, icon: "⚖️" },
    { id: "bmi", label: "BMI", unit: "", color: bmiColor, icon: "📊" },
    { id: "bodyFat", label: "Body Fat", unit: "%", color: C.or, icon: "🔥" },
    { id: "chest", label: "Chest", unit: "cm", color: C.a2, icon: "📏" },
    { id: "waist", label: "Waist", unit: "cm", color: C.wn, icon: "📏" },
    { id: "hips", label: "Hips", unit: "cm", color: C.pk, icon: "📏" },
    { id: "bicepsL", label: "Biceps (L)", unit: "cm", color: C.ok, icon: "💪" },
    { id: "bicepsR", label: "Biceps (R)", unit: "cm", color: C.ok, icon: "💪" },
    { id: "shoulders", label: "Shoulders", unit: "cm", color: C.ac, icon: "📏" },
    { id: "thighL", label: "Thigh (L)", unit: "cm", color: C.a2, icon: "🦵" },
    { id: "thighR", label: "Thigh (R)", unit: "cm", color: C.a2, icon: "🦵" },
    { id: "calves", label: "Calves", unit: "cm", color: C.wn, icon: "📏" },
    { id: "neck", label: "Neck", unit: "cm", color: C.mt, icon: "📏" },
    { id: "forearm", label: "Forearm", unit: "cm", color: C.ok, icon: "💪" },
  ];

  const getMetricData = (metricId) => allEntries.filter(e => e[metricId] && +e[metricId] > 0).map(e => ({ date: e.date, value: +e[metricId], source: e.source || "manual" }));

  const shareOnWhatsApp = (clientName) => {
    let msg = `📊 *Progress Report — ${clientName || "Client"}*\n📅 ${new Date().toLocaleDateString()}\n\n`;
    if (lat) {
      if (lat.weight) msg += `⚖️ Weight: ${lat.weight}kg`;
      if (prev?.weight) { const d = diff("weight"); if (d) msg += ` (${d > 0 ? "+" : ""}${d.toFixed(1)}kg)`; }
      msg += "\n";
      if (currentBMI) msg += `📊 BMI: ${currentBMI} (${bmiCategory})\n`;
      if (lat.bodyFat) msg += `🔥 Body Fat: ${lat.bodyFat}%\n`;
      if (lat.chest) msg += `📏 Chest: ${lat.chest}cm\n`;
      if (lat.waist) msg += `📏 Waist: ${lat.waist}cm\n`;
      if (lat.hips) msg += `📏 Hips: ${lat.hips}cm\n`;
      if (lat.bicepsL || lat.bicepsR) msg += `💪 Biceps: L=${lat.bicepsL || "—"}cm R=${lat.bicepsR || "—"}cm\n`;
      if (lat.shoulders) msg += `📏 Shoulders: ${lat.shoulders}cm\n`;
      if (lat.thighL || lat.thighR) msg += `🦵 Thighs: L=${lat.thighL || "—"}cm R=${lat.thighR || "—"}cm\n`;
    }
    const weightData = getMetricData("weight");
    if (weightData.length >= 2) {
      const first = weightData[0]; const last = weightData[weightData.length - 1];
      const totalChange = (last.value - first.value).toFixed(1);
      msg += `\n📈 *Trend (${weightData.length} entries):*\n`;
      msg += `Start: ${first.value}kg → Now: ${last.value}kg\n`;
      msg += `Change: ${totalChange > 0 ? "+" : ""}${totalChange}kg over ${Math.ceil((new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24))} days\n`;
    }
    const devData = ls.get("device_data", []).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (devData) {
      msg += `\n⌚ *Latest Device Data:*\n`;
      if (devData.steps) msg += `🚶 Steps: ${devData.steps.toLocaleString()}\n`;
      if (devData.heartRateAvg) msg += `❤️ Avg HR: ${devData.heartRateAvg} bpm\n`;
      if (devData.sleepHours) msg += `😴 Sleep: ${devData.sleepHours}h\n`;
    }
    msg += `\n_Tracked on CoachMe.life_`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const TrendLine = ({ data, color, label, unit }) => {
    if (data.length < 2) return null;
    const vals = data.map(d => d.value);
    const min = Math.min(...vals); const max = Math.max(...vals); const range = max - min || 1;
    const first = vals[0]; const last = vals[vals.length - 1];
    const change = (last - first).toFixed(1);
    return (
      <Card style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{label}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: change > 0 ? C.dg : change < 0 ? C.ok : C.mt }}>{change > 0 ? "+" : ""}{change}{unit} ({data.length} pts)</span>
        </div>
        <svg viewBox={`0 0 ${Math.max(data.length * 30, 200)} 80`} style={{ width: "100%", height: 80 }}>
          {[0, 1, 2, 3].map(i => <line key={i} x1="0" y1={i * 20 + 10} x2={data.length * 30} y2={i * 20 + 10} stroke={C.bd} strokeWidth="0.5" />)}
          <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            points={data.map((d, i) => { const x = i * (Math.max(data.length * 30, 200) / (data.length - 1)); const y = 70 - ((d.value - min) / range) * 60; return `${x},${y}`; }).join(" ")} />
          {data.map((d, i) => { const x = i * (Math.max(data.length * 30, 200) / (data.length - 1)); const y = 70 - ((d.value - min) / range) * 60; return <circle key={i} cx={x} cy={y} r="3.5" fill={color} stroke={C.sf} strokeWidth="1.5"><title>{d.date}: {d.value}{unit} ({d.source})</title></circle>; })}
          <text x="2" y={70 - ((vals[0] - min) / range) * 60 - 8} fill={C.mt} fontSize="9" fontFamily="inherit">{vals[0]}{unit}</text>
          <text x={Math.max(data.length * 30, 200) - 30} y={70 - ((vals[vals.length - 1] - min) / range) * 60 - 8} fill={color} fontSize="9" fontWeight="600" fontFamily="inherit">{vals[vals.length - 1]}{unit}</text>
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.mt, marginTop: 4 }}>
          <span>{data[0].date.slice(5)}</span><span>{data[data.length - 1].date.slice(5)}</span>
        </div>
      </Card>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>Progress Tracker</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => shareOnWhatsApp()} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: "#25D366" + "20", color: "#25D366" }}>📲 Share</button>
          <Btn onClick={() => setShowAdd(true)} style={{ padding: "6px 14px", fontSize: 12 }}>+ Log</Btn>
        </div>
      </div>

      <Tabs tabs={[{ id: "overview", label: "Overview" }, { id: "trends", label: "Trends" }, { id: "history", label: "History" }]} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <div>
          {lat ? (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                <Card style={{ padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.tx }}>{lat.weight || "—"}<span style={{ fontSize: 12, color: C.mt }}>kg</span></div>
                  {diff("weight") !== null && <div style={{ fontSize: 11, color: diff("weight") > 0 ? C.dg : C.ok }}>{diff("weight") > 0 ? "+" : ""}{diff("weight").toFixed(1)}kg</div>}
                  <div style={{ fontSize: 11, color: C.mt }}>Weight</div>
                </Card>
                <Card style={{ padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: bmiColor }}>{currentBMI || "—"}</div>
                  {bmiCategory && <div style={{ fontSize: 10, color: bmiColor }}>{bmiCategory}</div>}
                  <div style={{ fontSize: 11, color: C.mt }}>BMI</div>
                </Card>
                <Card style={{ padding: 12, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.or }}>{lat.bodyFat || "—"}<span style={{ fontSize: 12, color: C.mt }}>%</span></div>
                  {diff("bodyFat") !== null && <div style={{ fontSize: 11, color: diff("bodyFat") > 0 ? C.dg : C.ok }}>{diff("bodyFat") > 0 ? "+" : ""}{diff("bodyFat").toFixed(1)}%</div>}
                  <div style={{ fontSize: 11, color: C.mt }}>Body Fat</div>
                </Card>
              </div>

              <Card style={{ padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Body Measurements</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[{ l: "Chest", v: lat.chest, u: "cm", icon: "📏" }, { l: "Waist", v: lat.waist, u: "cm", icon: "📏" }, { l: "Hips", v: lat.hips, u: "cm", icon: "📏" }, { l: "Shoulders", v: lat.shoulders, u: "cm", icon: "📏" }, { l: "Biceps L", v: lat.bicepsL, u: "cm", icon: "💪" }, { l: "Biceps R", v: lat.bicepsR, u: "cm", icon: "💪" }, { l: "Thigh L", v: lat.thighL, u: "cm", icon: "🦵" }, { l: "Thigh R", v: lat.thighR, u: "cm", icon: "🦵" }, { l: "Calves", v: lat.calves, u: "cm", icon: "📏" }, { l: "Neck", v: lat.neck, u: "cm", icon: "📏" }, { l: "Forearm", v: lat.forearm, u: "cm", icon: "💪" }, { l: "Height", v: lat.height, u: "cm", icon: "📐" }].filter(m => m.v && +m.v > 0).map(m => (
                    <div key={m.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.bd}`, fontSize: 12 }}>
                      <span style={{ color: C.mt }}>{m.icon} {m.l}</span>
                      <span style={{ color: C.tx, fontWeight: 600 }}>{m.v} {m.u}{diff(m.l.toLowerCase().replace(/\s/g, "")) !== null ? ` (${diff(m.l.toLowerCase().replace(/\s/g, "")) > 0 ? "+" : ""}${diff(m.l.toLowerCase().replace(/\s/g, "")).toFixed(1)})` : ""}</span>
                    </div>
                  ))}
                </div>
                {[...new Set(["chest", "waist", "hips", "shoulders", "bicepsL", "bicepsR", "thighL", "thighR"].filter(k => lat[k] && +lat[k] > 0))].length === 0 &&
                  <div style={{ color: C.mt, fontSize: 12, textAlign: "center", padding: 8 }}>Log measurements to see them here</div>}
              </Card>

              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {allEntries.some(e => e.source === "manual") && <Badge color={C.ac}>📝 Manual</Badge>}
                {allEntries.some(e => e.source === "device") && <Badge color={C.a2}>⌚ Device</Badge>}
                {allEntries.some(e => e.source === "checkin") && <Badge color={C.ok}>📋 Check-in</Badge>}
                <Badge color={C.mt}>{allEntries.length} entries</Badge>
              </div>
            </div>
          ) : <Empty icon="📏" text="No progress data yet. Log your first entry or connect a device!" />}
        </div>
      )}

      {tab === "trends" && (
        <div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            {metrics.filter(m => getMetricData(m.id).length >= 2).map(m => (
              <button key={m.id} onClick={() => setActiveMetric(m.id)} style={{ padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: activeMetric === m.id ? m.color + "30" : C.s2, color: activeMetric === m.id ? m.color : C.mt }}>{m.icon} {m.label}</button>
            ))}
          </div>
          {metrics.filter(m => getMetricData(m.id).length >= 2).length === 0 ? (
            <Empty icon="📈" text="Need at least 2 entries to show trends. Keep logging!" />
          ) : (
            <div>
              {(() => { const m = metrics.find(x => x.id === activeMetric); const data = getMetricData(activeMetric); return data.length >= 2 ? <TrendLine data={data} color={m.color} label={m.label} unit={m.unit} /> : null; })()}
              <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, margin: "16px 0 8px" }}>All Metrics</div>
              {metrics.filter(m => getMetricData(m.id).length >= 2 && m.id !== activeMetric).map(m => { const data = getMetricData(m.id); return <TrendLine key={m.id} data={data} color={m.color} label={m.label} unit={m.unit} />; })}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div>
          {allEntries.length === 0 ? <Empty icon="📋" text="No entries yet" /> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {allEntries.slice().reverse().map((e, i) => (
                <Card key={e.id || i} style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{e.date}</span>
                    <Badge color={e.source === "device" ? C.a2 : e.source === "checkin" ? C.ok : C.ac} style={{ fontSize: 10 }}>{e.source === "device" ? "⌚ Device" : e.source === "checkin" ? "📋 Check-in" : "📝 Manual"}</Badge>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11, color: C.mt }}>
                    {e.weight > 0 && <span>⚖️ {e.weight}kg</span>}
                    {e.bmi > 0 && <span>📊 BMI {e.bmi}</span>}
                    {e.bodyFat > 0 && <span>🔥 {e.bodyFat}%</span>}
                    {e.chest > 0 && <span>Chest {e.chest}</span>}
                    {e.waist > 0 && <span>Waist {e.waist}</span>}
                    {e.bicepsL > 0 && <span>💪L {e.bicepsL}</span>}
                    {e.bicepsR > 0 && <span>💪R {e.bicepsR}</span>}
                    {e.steps > 0 && <span>🚶 {e.steps.toLocaleString()}</span>}
                    {e.heartRateAvg > 0 && <span>❤️ {e.heartRateAvg}bpm</span>}
                  </div>
                  {e.notes && <div style={{ fontSize: 11, color: C.mt, marginTop: 6, fontStyle: "italic" }}>{e.notes}</div>}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log Progress" wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={{ flex: 1 }} />
            <button onClick={importFromDevice} style={{ padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.a2 + "20", color: C.a2, marginTop: 20, marginLeft: 8, whiteSpace: "nowrap" }}>⌚ Import</button>
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>Body Composition</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Input label="⚖️ Weight (kg)" type="number" step="0.1" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
            <Input label="📐 Height (cm)" type="number" value={form.height} onChange={e => setForm({ ...form, height: e.target.value })} />
            <Input label="🔥 Body Fat %" type="number" step="0.1" value={form.bodyFat} onChange={e => setForm({ ...form, bodyFat: e.target.value })} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>Upper Body</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Input label="📏 Chest" type="number" step="0.1" value={form.chest} onChange={e => setForm({ ...form, chest: e.target.value })} />
            <Input label="📏 Shoulders" type="number" step="0.1" value={form.shoulders} onChange={e => setForm({ ...form, shoulders: e.target.value })} />
            <Input label="📏 Neck" type="number" step="0.1" value={form.neck} onChange={e => setForm({ ...form, neck: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Input label="💪 Bicep L" type="number" step="0.1" value={form.bicepsL} onChange={e => setForm({ ...form, bicepsL: e.target.value })} />
            <Input label="💪 Bicep R" type="number" step="0.1" value={form.bicepsR} onChange={e => setForm({ ...form, bicepsR: e.target.value })} />
            <Input label="💪 Forearm" type="number" step="0.1" value={form.forearm} onChange={e => setForm({ ...form, forearm: e.target.value })} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>Lower Body</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Input label="📏 Waist" type="number" step="0.1" value={form.waist} onChange={e => setForm({ ...form, waist: e.target.value })} />
            <Input label="📏 Hips" type="number" step="0.1" value={form.hips} onChange={e => setForm({ ...form, hips: e.target.value })} />
            <Input label="📏 Calves" type="number" step="0.1" value={form.calves} onChange={e => setForm({ ...form, calves: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="🦵 Thigh L" type="number" step="0.1" value={form.thighL} onChange={e => setForm({ ...form, thighL: e.target.value })} />
            <Input label="🦵 Thigh R" type="number" step="0.1" value={form.thighR} onChange={e => setForm({ ...form, thighR: e.target.value })} />
          </div>
          <TextArea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any observations…" />
          <Btn onClick={save} style={{ width: "100%" }}>Save Progress Entry</Btn>
        </div>
      </Modal>
    </div>
  );
}
