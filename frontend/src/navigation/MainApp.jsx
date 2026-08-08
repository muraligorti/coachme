// ═══════════════════════════════════════════════════════════════════════
// MAIN APP (Coach shell) — owns tab/sub-tab routing, the floating voice
// button, global CSS (fonts, scrollbar, animations, the jz-press/jz-scrollx
// utility classes used across pages), and safe-area-aware padding.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useCallback } from "react";
import { C } from "../theme/theme.js";
import { BNav, MoreMenu, getBottomTabs } from "./BottomNav.jsx";
import { useVoice } from "./useVoice.js";
import DashboardPage from "../pages/dashboard/DashboardPage.jsx";
import InsightSettingsPage from "../pages/dashboard/InsightSettingsPage.jsx";
import WorkoutsPage from "../pages/WorkoutsPage.jsx";
import BookingsPage from "../pages/BookingsPage.jsx";
import ClientsPage from "../pages/ClientsPage.jsx";
import LeadsPage from "../pages/LeadsPage.jsx";
import AIChatPage from "../pages/AIChatPage.jsx";
import SettingsPage from "../pages/SettingsPage.jsx";
import MealPlannerPage from "../pages/MealPlannerPage.jsx";
import NutritionTracker from "../pages/NutritionTracker.jsx";
import HabitTracker from "../pages/HabitTracker.jsx";

import InvoicesPage from "../pages/InvoicesPage.jsx";

import FitnessDevicesPage from "../pages/FitnessDevicesPage.jsx";
import TestSuitePage from "../pages/TestSuitePage.jsx";

export default function MainApp() {
  const [tab, setTab] = useState("dashboard"); const [sub, setSub] = useState(null); const [rk, setRk] = useState(0);
  // Deep-link target for cross-page "jump straight to X" navigation — e.g.
  // Schedule's "View Workout" button on a booking sets {clientId, tab:"workouts"}
  // so ClientsPage opens directly on that client's Workouts sub-tab instead
  // of landing on the roster list.
  const [deepLink, setDeepLink] = useState(null);

  const handleV = useCallback((cmd, speak) => {
    const r = { dashboard: ["home", "dashboard"], workouts: ["workout", "exercise"], bookings: ["schedule", "booking", "calendar"], clients: ["client", "message", "chat"], leads: ["lead", "pipeline"], ai: ["ai", "assistant"], mealplan: ["meal", "diet", "nutrition plan"], habits: ["habit"], invoices: ["invoice", "payment", "billing"], settings: ["setting", "profile"], tests: ["test", "testing", "suite"], devices: ["device", "fitbit", "garmin", "watch", "health", "wearable"] };
    for (const [rt, kw] of Object.entries(r)) {
      if (kw.some(k => cmd.includes(k))) {
        if (["dashboard", "workouts", "bookings", "clients"].includes(rt)) { setTab(rt); setSub(null); } else { setTab("more"); setSub(rt); }
        setRk(k => k + 1); speak(`Opening ${rt}`); return;
      }
    }
    speak("Try saying a page name.");
  }, []);
  const { listening, toggle } = useVoice(handleV);
  const bottomIds = getBottomTabs();

  // nav(id) — plain tab switch, same as before.
  // nav(id, {clientId, tab}) — tab switch that also carries a deep-link
  // target, consumed once by the destination page then cleared.
  const nav = (id, params) => {
    setRk(k => k + 1); setDeepLink(params || null);
    if (bottomIds.includes(id)) { setTab(id); setSub(null); } else { setTab("more"); setSub(id); }
  };

  const render = () => {
    const K = `${tab}_${sub || ""}_${rk}`;
    const btmIds = getBottomTabs();
    if ((tab === "more" && sub) || (!btmIds.includes(tab) && tab !== "more")) {
      const subKey = sub || tab;
      const p = { clients: <ClientsPage key={K} deepLink={deepLink} onConsumeDeepLink={() => setDeepLink(null)} />, leads: <LeadsPage key={K} />, ai: <AIChatPage key={K} />, settings: <SettingsPage key={K} />, mealplan: <MealPlannerPage key={K} />, nutrition: <NutritionTracker key={K} />, habits: <HabitTracker key={K} />, invoices: <InvoicesPage key={K} />, devices: <FitnessDevicesPage key={K} />, tests: <TestSuitePage key={K} />, insightSettings: <InsightSettingsPage key={K} /> };
      return p[subKey] || <MoreMenu onNav={setSub} />;
    }
    const p = { dashboard: <DashboardPage key={K} onNav={nav} />, workouts: <WorkoutsPage key={K} />, bookings: <BookingsPage key={K} onNav={nav} />, clients: <ClientsPage key={K} deepLink={deepLink} onConsumeDeepLink={() => setDeepLink(null)} />, leads: <LeadsPage key={K} />, ai: <AIChatPage key={K} />, more: <MoreMenu onNav={setSub} /> };
    return p[tab] || <DashboardPage key={K} onNav={nav} />;
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.tx, fontFamily: "'DM Sans','SF Pro Display',-apple-system,system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{background:${C.bg};overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:4px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}input::placeholder,textarea::placeholder{color:${C.mt}}select option{background:${C.sf};color:${C.tx}}.jz-press{transition:transform .15s ease}.jz-press:active{transform:scale(.96)}.jz-scrollx{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}.jz-scrollx::-webkit-scrollbar{display:none}`}</style>
      <button onClick={toggle} style={{ position: "fixed", right: 16, bottom: "calc(96px + env(safe-area-inset-bottom,0px))", zIndex: 200, width: 48, height: 48, borderRadius: 24, border: "none", cursor: "pointer", background: listening ? C.dg : C.gr, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 20px ${listening ? C.dg + "60" : C.ac + "40"}`, animation: listening ? "pulse 1.5s ease infinite" : "none", fontSize: 20 }} title="Voice">🎙️</button>
      <div style={{ padding: "calc(16px + env(safe-area-inset-top,0px)) 16px 104px", maxWidth: 600, margin: "0 auto" }}>
        {(tab === "more" && sub) && <button onClick={() => { setSub(null); if (tab !== "more") setTab("more"); }} style={{ background: "none", border: "none", color: C.ac, cursor: "pointer", fontSize: 14, fontWeight: 600, marginBottom: 12, padding: 0, fontFamily: "inherit" }}>← Back</button>}
        {render()}
      </div>
      <BNav active={tab} onChange={nav} />
    </div>
  );
}
