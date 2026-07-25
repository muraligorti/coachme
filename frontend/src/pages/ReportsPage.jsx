// ═══════════════════════════════════════════════════════════════════════
// REPORTS — coach analytics. Base dashboard is available to every tier;
// revenue/workout tabs specifically require PRO+ (enforced server-side).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, SC, Tabs, ST, Spin } from "../components/ui.jsx";

export default function ReportsPage() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");

  useEffect(() => {
    setLoading(true);
    const ep = { dashboard: "/reports/coach/dashboard", revenue: "/reports/coach/revenue", clients: "/reports/coach/clients", workouts: "/reports/coach/workouts" }[tab] || "/reports/coach/dashboard";
    api.get(ep).then(d => setData(d?.data || d || {})).catch(() => setData({})).finally(() => setLoading(false));
  }, [tab]);

  if (loading) return <Spin />;
  return (
    <div>
      <ST>Analytics</ST>
      <Tabs tabs={[{ id: "dashboard", label: "Overview" }, { id: "revenue", label: "Revenue" }, { id: "clients", label: "Clients" }, { id: "workouts", label: "Workouts" }]} active={tab} onChange={setTab} />
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>Revenue</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.ok }}>₹{(data.totalRevenue ?? data.revenue ?? 0).toLocaleString()}</div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <SC label="Sessions" value={data.sessionsCompleted ?? data.totalBookings ?? 0} icon="📅" color={C.ac} />
        <SC label="Retention" value={`${data.retentionRate ?? 0}%`} icon="🔄" color={C.a2} />
        <SC label="Avg/Client" value={data.avgSessionsPerClient ?? 0} icon="📊" color={C.wn} />
        <SC label="Conversion" value={`${data.conversionRate ?? 0}%`} icon="🎯" color={C.ok} />
      </div>
    </div>
  );
}
