// ═══════════════════════════════════════════════════════════════════════
// ADMIN — AUDIT LOG — every sensitive action across the platform,
// including every admin action taken through this very portal (RBAC
// changes, deactivations, forced logouts) — the portal is a new way to
// trigger already-audited backend operations, never a path around auditing.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Card, Badge, Input, Empty, Spin, ST } from "../../components/ui.jsx";

const ACTION_COLORS = { admin_update_user: "#f5a623", admin_force_logout: "#ff5c5c", login: "#22d3a8", register: "#22d3a8", logout: "#8b96a8" };

export default function AdminAuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize: 50 });
    if (actionFilter) params.set("action", actionFilter);
    api.get(`/admin/audit?${params}`)
      .then(r => { setEntries(r.entries || []); setTotalPages(r.totalPages || 1); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [page]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 300); return () => clearTimeout(t); }, [actionFilter]);

  return (
    <div>
      <ST>Admin — Audit Log</ST>
      <Input placeholder="Filter by action (e.g. admin_update_user, login)…" value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ marginBottom: 14 }} />
      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      {loading ? <Spin /> : entries.length === 0 ? <Empty icon="📜" text="No audit entries found" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {entries.map(e => (
            <Card key={e.id} style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <Badge color={ACTION_COLORS[e.action] || C.mt} style={{ fontSize: 10 }}>{e.action}</Badge>
                    {e.resource && <span style={{ fontSize: 11, color: C.mt }}>on {e.resource}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.tx }}>{e.user?.email || "System"} {e.user?.role && `(${e.user.role})`}</div>
                  {e.details && <div style={{ fontSize: 11, color: C.mt, marginTop: 4, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{JSON.stringify(e.details)}</div>}
                </div>
                <div style={{ fontSize: 10, color: C.mt, whiteSpace: "nowrap" }}>{new Date(e.createdAt).toLocaleString()}</div>
              </div>
            </Card>
          ))}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.bd}`, background: C.s2, color: C.tx, cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? .5 : 1 }}>‹ Prev</button>
              <span style={{ fontSize: 12, color: C.mt, alignSelf: "center" }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.bd}`, background: C.s2, color: C.tx, cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? .5 : 1 }}>Next ›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
