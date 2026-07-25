// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD — the coach's Home screen: greeting, Daily Briefing, stat
// cards, and upcoming sessions.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";
import { unwrap, cName } from "../../lib/utils.js";
import { Card, Badge, SC, Spin } from "../../components/ui.jsx";
import DailyBriefing from "./DailyBriefing.jsx";

export default function DashboardPage({ onNav }) {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [up, setUp] = useState([]);
  const [clientCount, setClientCount] = useState(0);
  const [leadCount, setLeadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/reports/coach/dashboard").catch(() => ({})),
      api.get("/bookings").catch(() => ({})),
      api.get("/clients").catch(() => ({})),
      api.get("/leads").catch(() => ({})),
    ]).then(([s, b, c, l]) => {
      setStats(s?.data || s || {});
      const cl = unwrap(c, "clients"); setClientCount(cl.length);
      const ld = unwrap(l, "leads"); setLeadCount(ld.length);
      const allBk = unwrap(b, "bookings", "sessions");
      const now = new Date();
      setUp(allBk.filter(x => { try { const st = (x.status || "").toUpperCase(); return new Date(x.date || x.startTime || x.scheduledAt) >= now && st !== "CANCELLED" && st !== "ABSENT"; } catch { return false; } })
        .sort((a, b) => new Date(a.date || a.startTime || a.scheduledAt) - new Date(b.date || b.startTime || b.scheduledAt)).slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spin />;
  const g = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const go = (id) => { if (onNav) onNav(id); };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", top: -24, left: -16, right: -16, height: 200, background: `radial-gradient(circle at 20% 15%, ${C.ac}45, transparent 55%), radial-gradient(circle at 85% 5%, ${C.a2}35, transparent 50%)`, filter: "blur(14px)", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: C.mt, fontWeight: 500 }}>{g},</div>
          <h2 style={{ background: `linear-gradient(90deg, ${C.tx} 40%, ${C.ac} 130%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", fontSize: 24, margin: "2px 0 0", fontWeight: 800, letterSpacing: "-.3px" }}>{user?.name || "Coach"} 👋</h2>
        </div>
        <DailyBriefing onNav={go} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div onClick={() => go("clients")} style={{ cursor: "pointer" }}><SC label="Active Clients" value={clientCount} icon="👥" color={C.ac} /></div>
          <div onClick={() => go("reports")} style={{ cursor: "pointer" }}><SC label="Monthly Revenue" value={`₹${(stats.monthlyRevenue ?? stats.totalRevenue ?? 0).toLocaleString()}`} icon="📈" color={C.ok} /></div>
          <div onClick={() => go("bookings")} style={{ cursor: "pointer" }}><SC label="Upcoming" value={up.length} icon="📅" color={C.a2} /></div>
          <div onClick={() => go("leads")} style={{ cursor: "pointer" }}><SC label="Leads" value={leadCount} icon="🎯" color={C.wn} /></div>
        </div>
        <Card style={{ marginTop: 16, cursor: "pointer" }} onClick={() => go("bookings")}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.tx, marginBottom: 12 }}>Upcoming Sessions</div>
          {up.length === 0 ? <div style={{ color: C.mt, fontSize: 13 }}>No upcoming sessions</div> : up.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.bd}` }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: C.ac + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📅</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{cName(s.client) || s.type || "Session"}</div>
                <div style={{ fontSize: 12, color: C.mt }}>{new Date(s.date || s.startTime || s.scheduledAt).toLocaleDateString()} · {s.duration || 60}min</div>
              </div>
              <Badge color={(s.status || "").toLowerCase() === "confirmed" ? C.ok : C.wn}>{(s.status || "pending").toLowerCase()}</Badge>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
