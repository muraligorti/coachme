// ═══════════════════════════════════════════════════════════════════════
// CLIENT MAIN APP — the client-side app shell. Simpler than the coach
// MainApp: a fixed 6-tab bottom nav, no More menu, no voice button.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../theme/theme.js";
import ClientSchedulePage from "../pages/client/ClientSchedulePage.jsx";
import ClientProgressPage from "../pages/client/ClientProgressPage.jsx";
import ClientMediaPage from "../pages/client/ClientMediaPage.jsx";
import ClientSettingsPage from "../pages/client/ClientSettingsPage.jsx";
import FitnessDevicesPage from "../pages/FitnessDevicesPage.jsx";
import NutritionTracker from "../pages/NutritionTracker.jsx";
import { useDailyHealthSync } from "./useDailyHealthSync.js";

export default function ClientMainApp() {
  useDailyHealthSync();
  const [tab, setTab] = useState("schedule"); const [rk, setRk] = useState(0);
  const clientTabs = [{ id: "schedule", icon: "📅", label: "Schedule" }, { id: "progress", icon: "💪", label: "Progress" }, { id: "devices", icon: "⌚", label: "Devices" }, { id: "nutrition", icon: "🥗", label: "Nutrition" }];

  const render = () => {
    const K = `${tab}_${rk}`;
    const pages = { schedule: <ClientSchedulePage key={K} />, progress: <ClientProgressPage key={K} />, devices: <FitnessDevicesPage key={K} />, nutrition: <NutritionTracker key={K} />, photos: <ClientMediaPage key={K} />, settings: <ClientSettingsPage key={K} /> };
    return pages[tab] || <ClientSchedulePage key={K} />;
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.tx, fontFamily: "'DM Sans','SF Pro Display',-apple-system,system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{background:${C.bg};overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:4px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}input::placeholder,textarea::placeholder{color:${C.mt}}select option{background:${C.sf};color:${C.tx}}.jz-press{transition:transform .15s ease}.jz-press:active{transform:scale(.96)}.jz-scrollx{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}.jz-scrollx::-webkit-scrollbar{display:none}`}</style>
      <div style={{ padding: "calc(16px + env(safe-area-inset-top,0px)) 16px 104px", maxWidth: 600, margin: "0 auto" }}>{render()}</div>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: C.sf, borderTop: `1px solid ${C.bd}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
        {clientTabs.map(t => { const a = tab === t.id; return (
          <button key={t.id} onClick={() => { setTab(t.id); setRk(k => k + 1); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 0 10px", border: "none", cursor: "pointer", background: "transparent", minHeight: 60 }}>
            <div style={{ padding: "5px 14px", borderRadius: 12, background: a ? C.ac + "20" : "transparent", fontSize: 23, lineHeight: 1 }}>{t.icon}</div>
            <span style={{ fontSize: 11.5, fontWeight: a ? 700 : 500, color: a ? C.ac : C.mt }}>{t.label}</span>
          </button>
        ); })}
        {[{ id: "photos", icon: "📸", label: "Photos" }, { id: "settings", icon: "⚙️", label: "Settings" }].map(t => { const a = tab === t.id; return (
          <button key={t.id} onClick={() => { setTab(t.id); setRk(k => k + 1); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 0 10px", border: "none", cursor: "pointer", background: "transparent", minHeight: 60 }}>
            <div style={{ padding: "5px 14px", borderRadius: 12, background: a ? C.ac + "20" : "transparent", fontSize: 23, lineHeight: 1 }}>{t.icon}</div>
            <span style={{ fontSize: 11.5, fontWeight: a ? 700 : 500, color: a ? C.ac : C.mt }}>{t.label}</span>
          </button>
        ); })}
      </nav>
    </div>
  );
}
