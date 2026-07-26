// ═══════════════════════════════════════════════════════════════════════
// ADMIN MAIN APP — the platform-admin shell. Simple 2-tab nav (Users,
// Audit Log) — deliberately minimal for now; Reports/Bulk-upload/
// Impersonation are scoped as next phases, not built here yet.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
import AdminUsersPage from "../pages/admin/AdminUsersPage.jsx";
import AdminAuditLogPage from "../pages/admin/AdminAuditLogPage.jsx";

export default function AdminMainApp() {
  const { logout } = useAuth();
  const [tab, setTab] = useState("users"); const [rk, setRk] = useState(0);
  const tabs = [{ id: "users", icon: "👤", label: "Users" }, { id: "audit", icon: "📜", label: "Audit Log" }];

  const render = () => {
    const K = `${tab}_${rk}`;
    return tab === "audit" ? <AdminAuditLogPage key={K} /> : <AdminUsersPage key={K} />;
  };

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.tx, fontFamily: "'DM Sans','SF Pro Display',-apple-system,system-ui,sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{background:${C.bg};overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:${C.bd};border-radius:4px}@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:.3}50%{opacity:1}}input::placeholder,textarea::placeholder{color:${C.mt}}select option{background:${C.sf};color:${C.tx}}.jz-press{transition:transform .15s ease}.jz-press:active{transform:scale(.96)}`}</style>
      <div style={{ padding: "calc(16px + env(safe-area-inset-top,0px)) 16px 104px", maxWidth: 680, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: .5, background: "#E31937", color: "#fff", padding: "3px 8px", borderRadius: 20 }}>ADMIN</span>
            <span style={{ fontSize: 13, color: C.mt, fontWeight: 500 }}>CoachMe.life Platform</span>
          </div>
          <button onClick={() => { if (confirm("Sign out?")) logout(); }} style={{ width: 32, height: 32, borderRadius: 16, border: `1px solid ${C.bd}`, cursor: "pointer", background: C.sf, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }} title="Sign Out">🚪</button>
        </div>
        {render()}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100, background: C.sf, borderTop: `1px solid ${C.bd}`, display: "flex", paddingBottom: "env(safe-area-inset-bottom,0px)" }}>
        {tabs.map(t => { const a = tab === t.id; return (
          <button key={t.id} onClick={() => { setTab(t.id); setRk(k => k + 1); }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 0 10px", border: "none", cursor: "pointer", background: "transparent", minHeight: 60 }}>
            <div style={{ padding: "5px 14px", borderRadius: 12, background: a ? C.ac + "20" : "transparent", fontSize: 23, lineHeight: 1 }}>{t.icon}</div>
            <span style={{ fontSize: 11.5, fontWeight: a ? 700 : 500, color: a ? C.ac : C.mt }}>{t.label}</span>
          </button>
        ); })}
      </nav>
    </div>
  );
}
