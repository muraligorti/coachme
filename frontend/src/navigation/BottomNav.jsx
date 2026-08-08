// ═══════════════════════════════════════════════════════════════════════
// BOTTOM NAVIGATION — the coach app's 4 configurable tab slots + "More".
// Slot configuration is user-editable (see pages/SettingsPage.jsx) and
// persisted to localStorage.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { ls } from "../lib/storage.js";
import { Card, ST } from "../components/ui.jsx";
import { api } from "../lib/api.js";

export const ALL_TABS = [
  { id: "dashboard", icon: "🏠", label: "Home" },
  { id: "workouts", icon: "💪", label: "Workouts" },
  { id: "bookings", icon: "📅", label: "Schedule" },
  { id: "clients", icon: "👥", label: "Clients" },
  { id: "leads", icon: "🎯", label: "Leads" },
  { id: "ai", icon: "🤖", label: "AI Coach" },
  { id: "more", icon: "⚙️", label: "More" },
];
export const DEFAULT_BOTTOM = ["dashboard", "workouts", "bookings", "clients"];

export function getBottomTabs() {
  const saved = ls.get("bottom_tabs", null);
  if (saved && Array.isArray(saved) && saved.length === 4) return saved;
  return DEFAULT_BOTTOM;
}

export function TABS() { return getBottomTabs().map(id => ALL_TABS.find(t => t.id === id)).filter(Boolean); }

export function MoreMenu({ onNav }) {
  const btm = getBottomTabs();
  const [flags, setFlags] = useState(null); // null while loading = show everything, avoids a flash of missing items
  useEffect(() => { api.get("/rbac/mine").then(r => setFlags(r.flags || {})).catch(() => setFlags({})); }, []);
  const items = [
    { id: "clients", icon: "👥", label: "Clients", desc: "Manage clients" },
    { id: "leads", icon: "🎯", label: "Leads Pipeline", desc: "Kanban board" },
    { id: "mealplan", icon: "🍎", label: "AI Meal Planner", desc: "AI-generated plans" },
    { id: "invoices", icon: "🧾", label: "Invoices", desc: "Billing & payments" },
    { id: "ai", icon: "🤖", label: "AI Coach", desc: "RAG-powered assistant" },
    { id: "insightSettings", icon: "🧠", label: "AI Insights Settings", desc: "Tune Daily Briefing thresholds" },
    { id: "settings", icon: "⚙️", label: "Settings", desc: "Profile & prefs" },
  ].filter(i => i.id === "clients" || i.id === "settings" || flags === null || flags[i.id] !== false); // core items always shown; everything else respects admin flags once loaded
  return (
    <div>
      <ST>More</ST>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.filter(i => !btm.includes(i.id) || i.id === "settings" || i.id === "tests").map(i => (
          <Card key={i.id} onClick={() => onNav(i.id)} style={{ padding: 14, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: C.ac + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{i.icon}</div>
            <div style={{ flex: 1 }}><div style={{ color: C.tx, fontSize: 14, fontWeight: 600 }}>{i.label}</div><div style={{ color: C.mt, fontSize: 12 }}>{i.desc}</div></div>
            <span style={{ color: C.mt, fontSize: 18 }}>›</span>
          </Card>
        ))}
      </div>
    </div>
  );
}
export function BNav({ active, onChange }) {
  const tabs = TABS();
  return (
    <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: C.sf, borderTop: `1px solid ${C.bd}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
      {tabs.map(t => {
        const a = active === t.id;
        return (
          <button key={t.id} onClick={() => onChange(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 0 10px", border: "none", cursor: "pointer", background: "transparent", minHeight: 60 }}>
            <div style={{ padding: "5px 14px", borderRadius: 12, background: a ? C.ac + "20" : "transparent", fontSize: 23, lineHeight: 1 }}>{t.icon}</div>
            <span style={{ fontSize: 11.5, fontWeight: a ? 700 : 500, color: a ? C.ac : C.mt }}>{t.label}</span>
          </button>
        );
      })}
      <button onClick={() => onChange("more")} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 0 10px", border: "none", cursor: "pointer", background: "transparent", minHeight: 60 }}>
        <div style={{ padding: "5px 14px", borderRadius: 12, background: active === "more" ? C.ac + "20" : "transparent", fontSize: 23, lineHeight: 1 }}>⚙️</div>
        <span style={{ fontSize: 11.5, fontWeight: active === "more" ? 700 : 500, color: active === "more" ? C.ac : C.mt }}>More</span>
      </button>
    </nav>
  );
}
