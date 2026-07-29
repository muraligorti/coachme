// ═══════════════════════════════════════════════════════════════════════
// CLIENT MAIN APP — the client-side app shell. Bottom nav is horizontally
// scrollable (fixed-width tabs, not flex) since there are now 8
// destinations — Schedule/Progress/Nutrition/Check-ins/Habits are the
// most-used day-to-day ones and sit first; Devices/Photos/Settings are
// more occasional and sit at the scrollable tail.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import ClientSchedulePage from "../pages/client/ClientSchedulePage.jsx";
import ClientProgressPage from "../pages/client/ClientProgressPage.jsx";
import ClientMediaPage from "../pages/client/ClientMediaPage.jsx";
import ClientSettingsPage from "../pages/client/ClientSettingsPage.jsx";
import FitnessDevicesPage from "../pages/FitnessDevicesPage.jsx";
import NutritionTracker from "../pages/NutritionTracker.jsx";
import CheckInsPage from "../pages/CheckInsPage.jsx";
import HabitTracker from "../pages/HabitTracker.jsx";
import { useDailyHealthSync } from "./useDailyHealthSync.js";

const ALL_CLIENT_TABS = [
  { id: "schedule", icon: "📅", label: "Schedule" }, // core — always visible, never admin-restrictable
  { id: "progress", icon: "💪", label: "Progress" }, // core — always visible
  { id: "nutrition", icon: "🥗", label: "Nutrition" },
  { id: "checkins", icon: "📋", label: "Check-ins" },
  { id: "habits", icon: "✅", label: "Habits" },
  { id: "devices", icon: "⌚", label: "Devices" },
  { id: "photos", icon: "📸", label: "Photos" },
  { id: "settings", icon: "⚙️", label: "Settings" }, // core — always visible
];
const CORE_TABS = new Set(["schedule", "progress", "settings"]);

export default function ClientMainApp() {
  useDailyHealthSync();
  const [tab, setTab] = useState("schedule"); const [rk, setRk] = useState(0);
  const [flags, setFlags] = useState(null); // null while loading = show everything, avoids a flash of missing tabs
  useEffect(() => { api.get("/rbac/mine").then(r => setFlags(r.flags || {})).catch(() => setFlags({})); }, []);
  const TABS = ALL_CLIENT_TABS.filter(t => CORE_TABS.has(t.id) || flags === null || flags[t.id] !== false);

  const render = () => {
    const K = `${tab}_${rk}`;
    const pages = {
      schedule: <ClientSchedulePage key={K} />, progress: <ClientProgressPage key={K} />,
      devices: <FitnessDevicesPage key={K} />, nutrition: <NutritionTracker key={K} />,
      checkins: <CheckInsPage key={K} />, habits: <HabitTracker key={K} />,
      photos: <ClientMediaPage key={K} />, settings: <ClientSettingsPage key={K} />,
    };
    return pages[tab] || <ClientSchedulePage key={K} />;
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.tx, fontFamily: "'DM Sans','SF Pro Display',-apple-system,system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{background:${C.bg};overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:4px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}input::placeholder,textarea::placeholder{color:${C.mt}}select option{background:${C.sf};color:${C.tx}}.jz-press{transition:transform .15s ease}.jz-press:active{transform:scale(.96)}.jz-scrollx{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}.jz-scrollx::-webkit-scrollbar{display:none}`}</style>
      <div style={{ padding: "calc(16px + env(safe-area-inset-top,0px)) 16px 104px", maxWidth: 600, margin: "0 auto" }}>{render()}</div>
      <nav className="jz-scrollx" style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: C.sf, borderTop: `1px solid ${C.bd}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
        {TABS.map(t => { const a = tab === t.id; return (
          <button key={t.id} onClick={() => { setTab(t.id); setRk(k => k + 1); }} style={{ flexShrink: 0, width: 66, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 0 10px", border: "none", cursor: "pointer", background: "transparent", minHeight: 60 }}>
            <div style={{ padding: "5px 12px", borderRadius: 12, background: a ? C.ac + "20" : "transparent", fontSize: 21, lineHeight: 1 }}>{t.icon}</div>
            <span style={{ fontSize: 10.5, fontWeight: a ? 700 : 500, color: a ? C.ac : C.mt, whiteSpace: "nowrap" }}>{t.label}</span>
          </button>
        ); })}
      </nav>
    </div>
  );
}
