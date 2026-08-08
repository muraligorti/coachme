// ═══════════════════════════════════════════════════════════════════════
// ADMIN CONFIG — edit tier limits/features and the specializations list,
// both previously hardcoded constants, now backed by the SystemConfig
// table (see backend/src/lib/systemConfig.js).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Card, Btn, Input, ST, Spin } from "../../components/ui.jsx";

const TIERS = ["FREE", "STARTER", "PRO", "ELITE", "PREMIUM"];
const FEATURE_LABELS = {
  aiCoaching: "AI Coaching", leadScoring: "Lead Scoring", bulkUpload: "Bulk Client Upload",
  advancedAnalytics: "Advanced Analytics", brandedApp: "Branded App", apiAccess: "API Access",
};

export default function AdminConfigPage() {
  const [tierFeatures, setTierFeatures] = useState(null);
  const [specializations, setSpecializations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingTiers, setSavingTiers] = useState(false);
  const [savingSpecs, setSavingSpecs] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    api.get("/admin/config").then(r => { setTierFeatures(r.tierFeatures); setSpecializations(r.specializations); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const flash = (label) => { setSaved(label); setTimeout(() => setSaved(""), 2000); };

  const saveTierFeatures = async () => {
    setSavingTiers(true); setError("");
    try { await api.req("/admin/config/tierFeatures", { method: "PUT", body: JSON.stringify({ value: tierFeatures }) }); flash("Tier limits saved"); }
    catch (e) { setError(e.message); }
    setSavingTiers(false);
  };

  const saveSpecializations = async () => {
    setSavingSpecs(true); setError("");
    try { await api.req("/admin/config/specializations", { method: "PUT", body: JSON.stringify({ value: specializations }) }); flash("Specializations saved"); }
    catch (e) { setError(e.message); }
    setSavingSpecs(false);
  };

  if (loading) return <Spin />;

  return (
    <div>
      <ST>System Config</ST>
      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      {saved && <div style={{ color: C.ok, fontSize: 13, padding: "10px 14px", background: C.ok + "15", borderRadius: 10, marginBottom: 12 }}>✓ {saved}</div>}

      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>Tier Limits & Features</div>
      <div style={{ fontSize: 11, color: C.mt, marginBottom: 12 }}>Changes take effect within 30 seconds (cached) — no deploy needed.</div>
      {TIERS.map(tier => (
        <Card key={tier} style={{ padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{tier}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: C.mt }}>Max clients</span>
              <input type="number" value={tierFeatures[tier]?.maxClients ?? 0} onChange={e => setTierFeatures({ ...tierFeatures, [tier]: { ...tierFeatures[tier], maxClients: +e.target.value } })}
                style={{ width: 64, background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "6px 8px", color: C.tx, fontSize: 13, textAlign: "center" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Object.entries(FEATURE_LABELS).map(([key, label]) => {
              const on = !!tierFeatures[tier]?.[key];
              return (
                <button key={key} onClick={() => setTierFeatures({ ...tierFeatures, [tier]: { ...tierFeatures[tier], [key]: !on } })}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: on ? C.ok + "20" : C.s2, color: on ? C.ok : C.mt }}>
                  {on ? "✓ " : ""}{label}
                </button>
              );
            })}
          </div>
        </Card>
      ))}
      <Btn onClick={saveTierFeatures} disabled={savingTiers} style={{ width: "100%", marginBottom: 24 }}>{savingTiers ? "Saving…" : "Save Tier Limits & Features"}</Btn>

      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>Specializations</div>
      <div style={{ fontSize: 11, color: C.mt, marginBottom: 12 }}>Shown at coach signup and in Settings. The value (left) is stored data — changing it on an existing option could orphan coaches already using it; safer to add new ones than edit existing values.</div>
      <Card style={{ padding: 14, marginBottom: 12 }}>
        {specializations.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <input value={s.v} onChange={e => setSpecializations(specializations.map((sp, j) => j === i ? { ...sp, v: e.target.value } : sp))} placeholder="value (e.g. boxing)"
              style={{ flex: 1, background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "8px 10px", color: C.tx, fontSize: 12.5 }} />
            <input value={s.l} onChange={e => setSpecializations(specializations.map((sp, j) => j === i ? { ...sp, l: e.target.value } : sp))} placeholder="label (e.g. 🥊 Boxing)"
              style={{ flex: 1, background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "8px 10px", color: C.tx, fontSize: 12.5 }} />
            <button onClick={() => setSpecializations(specializations.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: C.dg, cursor: "pointer", fontSize: 16, padding: 4 }}>✕</button>
          </div>
        ))}
        <button onClick={() => setSpecializations([...specializations, { v: "", l: "" }])} style={{ fontSize: 12.5, color: C.ac, background: "none", border: "none", cursor: "pointer", fontWeight: 600, padding: 0 }}>+ Add specialization</button>
      </Card>
      <Btn onClick={saveSpecializations} disabled={savingSpecs} style={{ width: "100%" }}>{savingSpecs ? "Saving…" : "Save Specializations"}</Btn>
    </div>
  );
}
