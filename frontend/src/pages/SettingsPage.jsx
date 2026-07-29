// ═══════════════════════════════════════════════════════════════════════
// SETTINGS — profile edit, theme picker, bottom-nav tab customization.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { Card, Badge, Btn, Input, ST } from "../components/ui.jsx";
import { ALL_TABS, DEFAULT_BOTTOM, getBottomTabs } from "../navigation/BottomNav.jsx";

const SPECIALIZATION_OPTIONS = [{ v: "strength", l: "💪 Strength" }, { v: "yoga", l: "🧘 Yoga" }, { v: "pilates", l: "🤸 Pilates" }, { v: "crossfit", l: "🏋️ CrossFit" }, { v: "general", l: "✨ General" }];
const TIER_COLORS = { FREE: "#8b96a8", STARTER: "#8b96a8", PRO: "#f5a623", ELITE: "#22d3a8", PREMIUM: "#22d3a8" };

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { themeName, switchTheme, themes } = useTheme();
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [saved, setSaved] = useState(false);
  const [bottomTabs, setBottomTabs] = useState(getBottomTabs());
  const [coachInfo, setCoachInfo] = useState(null); // { specializations, tier, maxClients }
  const [specSaved, setSpecSaved] = useState(false);

  useEffect(() => {
    if (user?.role !== "COACH") return;
    api.get("/coach-profile/me").then(setCoachInfo).catch(() => {});
  }, [user?.role]);

  const toggleSpecialization = (v) => {
    setCoachInfo(prev => {
      const current = prev?.specializations || [];
      const next = current.includes(v) ? current.filter(x => x !== v) : [...current, v];
      return { ...prev, specializations: next };
    });
    setSpecSaved(false);
  };

  const saveSpecializations = async () => {
    try {
      await api.put("/coach-profile/specializations", { specializations: coachInfo?.specializations || [] });
      setSpecSaved(true); setTimeout(() => setSpecSaved(false), 2000);
    } catch (e) { alert("Could not save: " + e.message); }
  };

  const save = async () => { try { await api.put("/auth/profile", profile); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch { } };

  const moveTab = (idx, dir) => {
    const arr = [...bottomTabs]; const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setBottomTabs(arr); ls.set("bottom_tabs", arr);
  };
  const swapTab = (idx, newId) => {
    if (newId === "more") return;
    const arr = [...bottomTabs]; arr[idx] = newId;
    setBottomTabs(arr); ls.set("bottom_tabs", arr);
  };
  const resetTabs = () => { const d = [...DEFAULT_BOTTOM]; setBottomTabs(d); ls.set("bottom_tabs", d); };

  return (
    <div>
      <ST>Settings</ST>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff" }}>{(user?.name || "U")[0].toUpperCase()}</div>
          <div><div style={{ color: C.tx, fontSize: 16, fontWeight: 600 }}>{user?.name}</div><Badge>{user?.role || "coach"}</Badge></div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
          <Input label="Email" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} />
          <Btn onClick={save} style={{ width: "100%" }}>{saved ? "✓ Saved!" : "Update Profile"}</Btn>
        </div>
      </Card>

      {user?.role === "COACH" && coachInfo && (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Plan &amp; Specialization</div>
            <Badge color={TIER_COLORS[coachInfo.tier] || C.mt}>{coachInfo.tier}</Badge>
          </div>
          <div style={{ fontSize: 11, color: C.mt, marginBottom: 14 }}>{coachInfo.maxClients >= 999 ? "Unlimited clients" : `Up to ${coachInfo.maxClients} clients`} on your current plan. Upgrades are handled by an admin.</div>
          <div style={{ fontSize: 12, color: C.mt, fontWeight: 500, marginBottom: 8 }}>Your specialization (shapes which exercises &amp; templates you see)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {SPECIALIZATION_OPTIONS.map(s => {
              const checked = (coachInfo.specializations || []).includes(s.v);
              return <button key={s.v} onClick={() => toggleSpecialization(s.v)} style={{ padding: "8px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: checked ? C.ac : C.s2, color: checked ? "#fff" : C.mt }}>{s.l}</button>;
            })}
          </div>
          <Btn onClick={saveSpecializations} style={{ width: "100%" }}>{specSaved ? "✓ Saved!" : "Save Specialization"}</Btn>
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 12 }}>Theme</div>
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(themes).map(([id, t]) => (
            <button key={id} onClick={() => switchTheme(id)} style={{ flex: 1, padding: "14px 8px", borderRadius: 14, border: themeName === id ? `2px solid ${C.ac}` : `1px solid ${C.bd}`, background: t.sf, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, transition: "all .2s", transform: themeName === id ? "scale(1.03)" : "scale(1)", boxShadow: themeName === id ? `0 4px 16px ${t.ac}30` : "none" }}>
              <div style={{ display: "flex", gap: 3 }}><div style={{ width: 14, height: 14, borderRadius: 4, background: t.ac }} /><div style={{ width: 14, height: 14, borderRadius: 4, background: t.a2 }} /><div style={{ width: 14, height: 14, borderRadius: 4, background: t.ok }} /></div>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.tx }}>{t.name}</span>
              <div style={{ width: "100%", height: 4, borderRadius: 2, background: t.gr }} />
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Bottom Navigation</div>
          <button onClick={resetTabs} style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.s2, color: C.mt }}>Reset</button>
        </div>
        <div style={{ fontSize: 12, color: C.mt, marginBottom: 10 }}>Choose which 4 tabs appear in the bottom bar. "More" is always available.</div>
        {bottomTabs.map((tabId, i) => {
          const tabDef = ALL_TABS.find(t => t.id === tabId);
          const available = ALL_TABS.filter(t => t.id !== "more" && (!bottomTabs.includes(t.id) || t.id === tabId));
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${C.bd}` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <button onClick={() => moveTab(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i > 0 ? "pointer" : "default", fontSize: 14, color: i > 0 ? C.tx : C.bd, padding: 0 }}>▲</button>
                <button onClick={() => moveTab(i, 1)} disabled={i === bottomTabs.length - 1} style={{ background: "none", border: "none", cursor: i < bottomTabs.length - 1 ? "pointer" : "default", fontSize: 14, color: i < bottomTabs.length - 1 ? C.tx : C.bd, padding: 0 }}>▼</button>
              </div>
              <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{tabDef?.icon || "?"}</span>
              <select value={tabId} onChange={e => swapTab(i, e.target.value)} style={{ flex: 1, background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "6px 10px", color: C.tx, fontSize: 13, fontFamily: "inherit" }}>
                {available.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
              <span style={{ fontSize: 12, color: C.mt, fontWeight: 600 }}>Slot {i + 1}</span>
            </div>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", opacity: 0.5 }}>
          <div style={{ width: 28 }} /><span style={{ fontSize: 18, width: 28, textAlign: "center" }}>⚙️</span>
          <span style={{ flex: 1, fontSize: 13, color: C.mt, fontStyle: "italic" }}>More — always visible</span>
          <span style={{ fontSize: 12, color: C.mt, fontWeight: 600 }}>Fixed</span>
        </div>
      </Card>

      <Card><Btn variant="danger" onClick={logout} style={{ width: "100%" }}>🚪 Sign Out</Btn></Card>
    </div>
  );
}
