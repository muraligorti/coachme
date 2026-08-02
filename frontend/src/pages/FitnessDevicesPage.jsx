// ═══════════════════════════════════════════════════════════════════════
// FITNESS DEVICES — connect wearables (real OAuth for Fitbit/Strava/
// Huawei; native bridge for Apple Health/Health Connect; manual-only for
// everything else with no public API), per-metric sharing consent
// (client side), and a coach-side view of shared client health data.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap, cName, cEmail } from "../lib/utils.js";
import { isNativeApp, requestNativeHealthAccess, readNativeHealthToday } from "../lib/nativeHealth.js";
import { Card, Badge, Btn, Input, Modal, Empty, Tabs, ST } from "../components/ui.jsx";

export default function FitnessDevicesPage() {
  const { user } = useAuth();
  const isCoach = user?.role === "COACH" || user?.role === "coach";
  const [connections, setConnections] = useState(ls.get("device_connections", {}));
  const [syncData, setSyncData] = useState(ls.get("device_data", []));
  const [sharing, setSharing] = useState(ls.get("device_sharing", { shareWithCoach: true, metrics: { steps: true, heartRate: true, sleep: true, calories: true, spo2: true, weight: true, stress: true } }));
  const [clients, setClients] = useState([]); const [selClient, setSelClient] = useState(null);
  const [showManual, setShowManual] = useState(false); const [tab, setTab] = useState(isCoach ? "clients" : "connect");
  const [manualSource, setManualSource] = useState("manual");
  const [manualForm, setManualForm] = useState({ date: new Date().toISOString().slice(0, 10), steps: "", heartRateAvg: "", heartRateMax: "", sleepHours: "", sleepQuality: "", caloriesBurned: "", activeMinutes: "", distance: "", weight: "", spo2: "", stressLevel: "" });

  // Handle OAuth callback redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("device_connected");
    if (connected) {
      const updated = { ...connections, [connected]: true };
      setConnections(updated); ls.set("device_connections", updated);
      api.post(`/health-data/fetch/${connected}`).then(r => {
        if (r.data) { const newData = [...syncData.filter(d => d.source !== connected), ...(r.data || [])]; setSyncData(newData); ls.set("device_data", newData); }
      }).catch(() => {});
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (isCoach) { api.get("/clients").then(d => setClients(unwrap(d, "clients"))).catch(() => {}); }
    else {
      api.get("/health-data/connections").then(d => {
        const tokens = Array.isArray(d) ? d : [];
        const conn = { ...connections };
        tokens.forEach(t => { conn[t.provider] = true; });
        setConnections(conn); ls.set("device_connections", conn);
      }).catch(() => {});
    }
  }, []);

  // Only genuinely configurable options here — real OAuth connections or
  // real native bridges. Manual-only "devices" (Garmin, Mi Band, Noise,
  // boAt, Polar, COROS, WHOOP — none of which publish a public API),
  // the deprecated Google Fit, and the OnePlus/Samsung info-redirects
  // (which just point at Health Connect) were removed — none of them let
  // a user actually configure or connect anything. Manual health-data
  // logging is still available via the "✏️ Manual" button in the header.
  const devices = [
    { id: "fitbit", name: "Fitbit", icon: "⌚", color: "#00B0B9", desc: "Steps, heart rate, sleep, SpO2", type: "oauth" },
    { id: "strava", name: "Strava", icon: "🧡", color: "#FC4C02", desc: "Running, cycling, swimming activities", type: "oauth" },
    { id: "healthConnect", name: "Health Connect", icon: "💚", color: "#0F9D58", desc: "Android's unified health hub — covers OnePlus, Samsung & most Android trackers", type: "native-bridge", note: "Reads directly from the CoachMe Android app. Not available in this web version — install the app to connect." },
    { id: "appleHealth", name: "Apple Health", icon: "🍎", color: "#FF3B30", desc: "All metrics synced to HealthKit", type: "native-bridge", note: "Reads directly from the CoachMe iOS app. Not available in this web version — install the app to connect." },
    { id: "huawei", name: "Huawei Health", icon: "🔴", color: "#CF0A2C", desc: "Steps, heart rate, sleep, SpO2, stress", type: "oauth", note: "Requires a Huawei Developer account with Health Kit scope approved — heavier setup than Fitbit/Strava." },
  ];

  const toggleConnect = async (id) => {
    const dev = devices.find(d => d.id === id);
    if (connections[id]) {
      if (!confirm(`Disconnect ${dev.name}?`)) return;
      api.del(`/health-data/disconnect/${id}`).catch(() => {});
      const updated = { ...connections }; delete updated[id];
      setConnections(updated); ls.set("device_connections", updated);
      setSyncData(prev => prev.filter(d => d.source !== id));
      ls.set("device_data", syncData.filter(d => d.source !== id));
      return;
    }
    if (dev.type === "oauth") {
      try {
        const r = await api.get(`/health-data/oauth/${id}/start`);
        if (r.url) { window.location.href = r.url; return; }
        else { alert(r.error || `Could not start ${dev.name} OAuth. Admin may need to configure API keys.`); }
      } catch (e) {
        alert(`${dev.name} OAuth not configured yet.\n\n${e.message}\n\nAdmin needs to set ${id.toUpperCase()}_CLIENT_ID and ${id.toUpperCase()}_CLIENT_SECRET environment variables.`);
      }
    } else if (dev.type === "native-bridge") {
      if (!isNativeApp()) {
        alert(`${dev.name}\n\n${dev.note}`);
        setManualSource(id); setShowManual(true);
        return;
      }
      try {
        await requestNativeHealthAccess();
        const entry = await readNativeHealthToday();
        if (!entry) throw new Error("No data returned");
        const updated = { ...connections, [id]: true }; setConnections(updated); ls.set("device_connections", updated);
        await api.post("/health-data/sync", { entries: [entry] });
        const newData = [...syncData.filter(d => d.source !== id), entry]; setSyncData(newData); ls.set("device_data", newData);
        alert(`Connected ${dev.name} and synced today's data.`);
      } catch (e) {
        alert(`Couldn't read ${dev.name} data: ${e.message}\n\nYou can still log entries manually below.`);
        setManualSource(id); setShowManual(true);
      }
    } else if (dev.type === "deprecated") { alert(`${dev.name}\n\n${dev.note}`); }
    else if (dev.type === "info") { alert(`${dev.name}\n\n${dev.note}`); }
    else { alert(`${dev.name}\n\n${dev.note}`); setManualSource(id); setShowManual(true); }
  };

  const updateSharing = (key, val) => {
    const updated = key === "shareWithCoach" ? { ...sharing, shareWithCoach: val } : { ...sharing, metrics: { ...sharing.metrics, [key]: val } };
    setSharing(updated); ls.set("device_sharing", updated);
    api.put("/health-data/consent", { shareWithCoach: updated.shareWithCoach, metrics: updated.metrics }).catch(() => {});
    if (updated.shareWithCoach) {
      const filtered = syncData.map(d => {
        const out = { ...d };
        if (!updated.metrics.steps) delete out.steps; if (!updated.metrics.heartRate) { delete out.heartRateAvg; delete out.heartRateMax; }
        if (!updated.metrics.sleep) { delete out.sleepHours; delete out.sleepQuality; } if (!updated.metrics.calories) delete out.caloriesBurned;
        if (!updated.metrics.spo2) delete out.spo2; if (!updated.metrics.weight) delete out.weight; if (!updated.metrics.stress) delete out.stressLevel;
        return out;
      });
      ls.set("shared_health_data", filtered);
    } else { ls.set("shared_health_data", []); }
  };

  const saveManual = () => {
    const entry = { ...manualForm, source: manualSource || "manual", steps: +manualForm.steps || 0, heartRateAvg: +manualForm.heartRateAvg || 0, heartRateMax: +manualForm.heartRateMax || 0, sleepHours: +manualForm.sleepHours || 0, caloriesBurned: +manualForm.caloriesBurned || 0, activeMinutes: +manualForm.activeMinutes || 0, distance: +manualForm.distance || 0, weight: +manualForm.weight || 0, spo2: +manualForm.spo2 || 0, stressLevel: +manualForm.stressLevel || 0 };
    const updated = [...syncData, entry]; setSyncData(updated); ls.set("device_data", updated);
    api.post("/health-data/sync", { entries: [entry] }).catch(() => {});
    if (!isCoach && sharing.shareWithCoach) ls.set("shared_health_data", updated);
    setShowManual(false); setManualSource("manual"); setManualForm({ date: new Date().toISOString().slice(0, 10), steps: "", heartRateAvg: "", heartRateMax: "", sleepHours: "", sleepQuality: "", caloriesBurned: "", activeMinutes: "", distance: "", weight: "", spo2: "", stressLevel: "" });
  };

  const latest7 = syncData.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).reverse();
  const today = syncData.find(d => d.date === new Date().toISOString().slice(0, 10));
  const [clientData, setClientData] = useState([]);
  useEffect(() => { if (!selClient) return; api.get(`/health-data/client/${selClient.id}`).then(d => setClientData(d.data || d || [])).catch(() => setClientData(ls.get("shared_health_data", []))); }, [selClient]);

  const MetricGrid = ({ data }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      {[{ l: "Steps", v: data.steps?.toLocaleString(), icon: "🚶", c: C.ac }, { l: "Calories", v: data.caloriesBurned, icon: "🔥", c: C.or }, { l: "Active Min", v: data.activeMinutes, icon: "⏱️", c: C.ok }, { l: "Avg HR", v: data.heartRateAvg ? `${data.heartRateAvg} bpm` : null, icon: "❤️", c: C.dg }, { l: "Sleep", v: data.sleepHours ? `${data.sleepHours}h` : null, icon: "😴", c: C.ac }, { l: "SpO2", v: data.spo2 ? `${data.spo2}%` : null, icon: "🫁", c: C.a2 }, { l: "Resting HR", v: data.restingHeartRate ? `${data.restingHeartRate} bpm` : null, icon: "💤", c: C.dg }, { l: "HRV", v: data.heartRateVariability ? `${data.heartRateVariability}ms` : null, icon: "📈", c: C.a2 }, { l: "Body Fat", v: data.bodyFat ? `${data.bodyFat}%` : null, icon: "⚖️", c: C.pk }, { l: "Workouts", v: data.workoutCount ? `${data.workoutCount} (${data.workoutMinutes}min)` : null, icon: "🏋️", c: C.ok }].filter(m => m.v).map(m => (
        <div key={m.l} style={{ textAlign: "center", padding: 8, background: C.s2, borderRadius: 10 }}>
          <div style={{ fontSize: 16 }}>{m.icon}</div><div style={{ fontSize: 16, fontWeight: 700, color: m.c }}>{m.v}</div><div style={{ fontSize: 10, color: C.mt }}>{m.l}</div>
        </div>
      ))}
    </div>
  );

  const TrendChart = ({ data, field, label, color, unit = "" }) => {
    if (data.length < 2) return null;
    return (
      <Card style={{ padding: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 8 }}>{label}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }}>
          {data.map((d, i) => {
            const vals = data.map(x => x[field] || 0); const min = Math.min(...vals); const max = Math.max(...vals); const range = max - min || 1;
            const h = ((d[field] || 0) - min) / range * 55 + 15;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ fontSize: 9, color, fontWeight: 600 }}>{d[field] || "—"}{unit}</div>
                <div style={{ width: "100%", height: h, borderRadius: 4, background: color, opacity: .4 + (i / data.length) * .6 }} />
                <span style={{ fontSize: 8, color: C.mt }}>{d.date?.slice(8)}</span>
              </div>
            );
          })}
        </div>
      </Card>
    );
  };

  const coachTabs = isCoach ? [{ id: "clients", label: "Client Data" }, { id: "connect", label: "My Devices" }, { id: "data", label: "My Data" }, { id: "trends", label: "Trends" }] : [{ id: "connect", label: "Connect" }, { id: "sharing", label: "Sharing" }, { id: "data", label: "My Data" }, { id: "trends", label: "Trends" }];

  return (
    <div>
      <ST right={<Btn onClick={() => { setManualSource("manual"); setShowManual(true); }} style={{ padding: "8px 12px", fontSize: 12 }}>✏️ Manual</Btn>}>{isCoach ? "Client Health Data" : "My Fitness Devices"}</ST>
      <Tabs tabs={coachTabs} active={tab} onChange={setTab} />

      {tab === "clients" && isCoach && (
        <div>
          {clients.length === 0 ? <Empty icon="👥" text="No clients" /> : selClient ? (
            <div>
              <button onClick={() => setSelClient(null)} style={{ background: "none", border: "none", color: C.ac, cursor: "pointer", fontSize: 14, fontWeight: 600, marginBottom: 12, padding: 0, fontFamily: "inherit" }}>← All Clients</button>
              <Card style={{ marginBottom: 12, padding: 14 }}><div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{cName(selClient)}</div><div style={{ fontSize: 12, color: C.mt }}>Health data shared by client</div></Card>
              {clientData.length > 0 ? (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 8 }}>Latest Metrics</div>
                  <MetricGrid data={clientData[clientData.length - 1]} />
                  <div style={{ marginTop: 12 }}>
                    <TrendChart data={clientData.slice(-7)} field="steps" label="Steps (7d)" color={C.ac} />
                    <TrendChart data={clientData.slice(-7)} field="sleepHours" label="Sleep (7d)" color={C.a2} unit="h" />
                    <TrendChart data={clientData.slice(-7)} field="heartRateAvg" label="Avg HR (7d)" color={C.dg} unit="bpm" />
                  </div>
                </div>
              ) : <Card style={{ padding: 20, textAlign: "center" }}><div style={{ fontSize: 14, color: C.mt }}>This client hasn't shared health data yet.</div><div style={{ fontSize: 12, color: C.mt, marginTop: 8 }}>They need to connect a device and enable sharing in their CoachMe app.</div></Card>}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {clients.map(c => (
                <Card key={c.id} onClick={() => setSelClient(c)} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <div style={{ width: 42, height: 42, borderRadius: 12, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>{cName(c)[0].toUpperCase()}</div>
                  <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{cName(c)}</div><div style={{ fontSize: 12, color: C.mt }}>{cEmail(c)}</div></div>
                  <Badge color={C.mt}>View Data</Badge>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "sharing" && !isCoach && (
        <div>
          <Card style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div><div style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>Share with Coach</div><div style={{ fontSize: 12, color: C.mt }}>Your coach can view shared metrics</div></div>
              <button onClick={() => updateSharing("shareWithCoach", !sharing.shareWithCoach)} style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: sharing.shareWithCoach ? C.ok : C.bd, position: "relative", transition: "all .2s" }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", position: "absolute", top: 3, left: sharing.shareWithCoach ? 27 : 3, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
              </button>
            </div>
            {sharing.shareWithCoach && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Choose what to share:</div>
                {[{ key: "steps", label: "Steps & Distance", icon: "🚶" }, { key: "heartRate", label: "Heart Rate", icon: "❤️" }, { key: "sleep", label: "Sleep Data", icon: "😴" }, { key: "calories", label: "Calories Burned", icon: "🔥" }, { key: "spo2", label: "Blood Oxygen (SpO2)", icon: "🫁" }, { key: "weight", label: "Weight & Body Comp", icon: "⚖️" }, { key: "stress", label: "Stress Level", icon: "😰" }].map(m => (
                  <div key={m.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.bd}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 18 }}>{m.icon}</span><span style={{ fontSize: 13, color: C.tx, fontWeight: 500 }}>{m.label}</span></div>
                    <button onClick={() => updateSharing(m.key, !sharing.metrics[m.key])} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: sharing.metrics[m.key] ? C.ok : C.bd, position: "relative", transition: "all .2s" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: sharing.metrics[m.key] ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 2px rgba(0,0,0,.3)" }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card style={{ padding: 14, background: C.s2, border: `1px dashed ${C.bd}` }}>
            <div style={{ fontSize: 12, color: C.mt, textAlign: "center", lineHeight: 1.6 }}>🔒 Your data is private by default. Only metrics you enable above will be visible to your coach. You can change these settings anytime.</div>
          </Card>
        </div>
      )}

      {tab === "connect" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {devices.map(d => {
            const btnLabel = connections[d.id] ? "✓ Connected" : d.type === "manual-only" ? "Log Manually" : d.type === "info" ? "See Note" : d.type === "deprecated" ? "Discontinued" : "Connect";
            return (
              <Card key={d.id} style={{ padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: d.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{d.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: C.mt }}>{d.desc}</div>
                  {d.note && <div style={{ fontSize: 11, color: C.mt, marginTop: 3, opacity: .75, lineHeight: 1.4 }}>{d.note}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <button onClick={() => toggleConnect(d.id)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", background: connections[d.id] ? C.ok + "20" : C.ac + "20", color: connections[d.id] ? C.ok : C.ac }}>{btnLabel}</button>
                  {connections[d.id] && d.type === "oauth" && <button onClick={async () => { try { const r = await api.post(`/health-data/fetch/${d.id}`); if (r.data) { const newData = [...syncData.filter(x => x.source !== d.id), ...r.data]; setSyncData(newData); ls.set("device_data", newData); alert(`Synced ${r.fetched || r.data.length} record(s) from ${d.name}`); } else { alert("No new data"); } } catch (e) { alert("Sync failed: " + e.message); } }} style={{ padding: "4px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.a2 + "20", color: C.a2 }}>↻ Sync Now</button>}
                  {connections[d.id] && d.type === "native-bridge" && <button onClick={async () => { try { const entry = await readNativeHealthToday(); if (!entry) throw new Error("No data"); await api.post("/health-data/sync", { entries: [entry] }); const newData = [...syncData.filter(x => x.source !== d.id), entry]; setSyncData(newData); ls.set("device_data", newData); alert(`Synced today's data from ${d.name}`); } catch (e) { alert("Sync failed: " + e.message); } }} style={{ padding: "4px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.a2 + "20", color: C.a2 }}>↻ Sync Now</button>}
                  {d.type === "native-bridge" && !connections[d.id] && <span style={{ fontSize: 10, color: C.mt }}>App only</span>}
                  {d.type === "manual-only" && <span style={{ fontSize: 10, color: C.mt }}>No API</span>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "data" && (
        <div>
          {today ? <Card style={{ marginBottom: 12 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Today</div><MetricGrid data={today} /><div style={{ fontSize: 11, color: C.mt, marginTop: 8, textAlign: "right" }}>Source: {devices.find(x => x.id === today.source)?.name || today.source}</div></Card> :
            <Card style={{ padding: 16, textAlign: "center" }}><div style={{ color: C.mt, fontSize: 13 }}>No data today — connect a device or log manually</div></Card>}
          {syncData.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {syncData.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map((d, i) => (
              <Card key={i} style={{ padding: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.tx, minWidth: 56 }}>{d.date.slice(5)}</div>
                <div style={{ flex: 1, display: "flex", gap: 10, fontSize: 11, color: C.mt, flexWrap: "wrap" }}>
                  {d.steps > 0 && <span>🚶{d.steps.toLocaleString()}</span>}{d.caloriesBurned > 0 && <span>🔥{d.caloriesBurned}</span>}{d.heartRateAvg > 0 && <span>❤️{d.heartRateAvg}</span>}{d.sleepHours > 0 && <span>😴{d.sleepHours}h</span>}
                </div>
                <Badge color={C.mt} style={{ fontSize: 10 }}>{devices.find(x => x.id === d.source)?.name || d.source}</Badge>
              </Card>
            ))}
          </div>}
        </div>
      )}

      {tab === "trends" && (
        <div>
          {latest7.length > 1 ? (
            <div>
              <TrendChart data={latest7} field="steps" label="Steps (7 days)" color={C.ac} />
              <TrendChart data={latest7} field="sleepHours" label="Sleep (7 days)" color={C.a2} unit="h" />
              <TrendChart data={latest7} field="heartRateAvg" label="Avg Heart Rate (7 days)" color={C.dg} unit="bpm" />
              <TrendChart data={latest7} field="caloriesBurned" label="Calories Burned (7 days)" color={C.or} />
              {latest7.some(d => d.weight > 0) && <TrendChart data={latest7} field="weight" label="Weight (7 days)" color={C.pk} unit="kg" />}
            </div>
          ) : <Empty icon="📊" text="Connect a device to see trends" />}
        </div>
      )}

      <Modal open={showManual} onClose={() => { setShowManual(false); setManualSource("manual"); }} title={manualSource && manualSource !== "manual" ? `Log ${devices.find(d => d.id === manualSource)?.name || manualSource} Data` : "Log Health Data"} wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Date" type="date" value={manualForm.date} onChange={e => setManualForm({ ...manualForm, date: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Input label="🚶 Steps" type="number" value={manualForm.steps} onChange={e => setManualForm({ ...manualForm, steps: e.target.value })} />
            <Input label="🔥 Calories" type="number" value={manualForm.caloriesBurned} onChange={e => setManualForm({ ...manualForm, caloriesBurned: e.target.value })} />
            <Input label="⏱️ Active Min" type="number" value={manualForm.activeMinutes} onChange={e => setManualForm({ ...manualForm, activeMinutes: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Input label="❤️ Avg HR" type="number" value={manualForm.heartRateAvg} onChange={e => setManualForm({ ...manualForm, heartRateAvg: e.target.value })} />
            <Input label="🫁 SpO2 %" type="number" value={manualForm.spo2} onChange={e => setManualForm({ ...manualForm, spo2: e.target.value })} />
            <Input label="😴 Sleep hrs" type="number" step="0.1" value={manualForm.sleepHours} onChange={e => setManualForm({ ...manualForm, sleepHours: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input label="🏃 Distance km" type="number" step="0.1" value={manualForm.distance} onChange={e => setManualForm({ ...manualForm, distance: e.target.value })} />
            <Input label="⚖️ Weight kg" type="number" step="0.1" value={manualForm.weight} onChange={e => setManualForm({ ...manualForm, weight: e.target.value })} />
          </div>
          <Btn onClick={saveManual} style={{ width: "100%" }}>Save Health Data</Btn>
        </div>
      </Modal>
    </div>
  );
}
