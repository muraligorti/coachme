// ═══════════════════════════════════════════════════════════════════════
// ADMIN — USERS — list/search/filter every user on the platform, view
// full detail, and edit role (RBAC) / active status / email-verified.
// Every mutation here goes through backend-enforced ADMIN-only routes
// and safety guards (can't demote/deactivate yourself, warned before
// deactivating a coach with active clients) — this page never assumes
// the backend will just accept whatever it sends.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";
import { Card, Badge, Btn, Input, Sel, Empty, Spin, ST, Tabs } from "../../components/ui.jsx";

const ROLE_COLORS = { ADMIN: "#E31937", COACH: "#f5a623", CLIENT: "#22d3a8" };

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [sel, setSel] = useState(null); // selected user detail
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    const params = new URLSearchParams({ page, pageSize: 20 });
    if (roleFilter) params.set("role", roleFilter);
    if (search) params.set("search", search);
    api.get(`/admin/users?${params}`)
      .then(r => { setUsers(r.users || []); setTotalPages(r.totalPages || 1); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [roleFilter, page]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 350); return () => clearTimeout(t); }, [search]);

  const openDetail = (u) => {
    setSel(u); setDetail(null); setDetailLoading(true); setError("");
    api.get(`/admin/users/${u.id}`).then(setDetail).catch(e => setError(e.message)).finally(() => setDetailLoading(false));
  };

  const updateUser = async (changes) => {
    setSaving(true); setError("");
    try {
      const updated = await api.req(`/admin/users/${sel.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      setDetail(d => ({ ...d, ...updated }));
      load();
    } catch (e) {
      if (e.message.includes("active client")) {
        if (confirm(e.message + "\n\nDeactivate anyway?")) {
          try {
            const updated = await api.req(`/admin/users/${sel.id}`, { method: "PATCH", body: JSON.stringify({ ...changes, confirmDespiteActiveClients: true }) });
            setDetail(d => ({ ...d, ...updated })); load();
          } catch (e2) { setError(e2.message); }
        }
      } else setError(e.message);
    }
    setSaving(false);
  };

  const forceLogout = async () => {
    if (!confirm(`Sign ${detail.email} out of all devices?`)) return;
    try { const r = await api.post(`/admin/users/${sel.id}/force-logout`); alert(r.message); } catch (e) { alert("Failed: " + e.message); }
  };

  if (sel) {
    const isSelf = detail?.id === me?.id;
    return (
      <div>
        <button onClick={() => { setSel(null); setDetail(null); }} style={{ background: "none", border: "none", color: C.ac, cursor: "pointer", fontSize: 14, fontWeight: 600, marginBottom: 12, padding: 0, fontFamily: "inherit" }}>← All Users</button>
        {detailLoading || !detail ? <Spin /> : (
          <div>
            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: "#fff" }}>{(detail.coachProfile?.displayName || detail.clientProfile?.displayName || detail.email)[0].toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>{detail.coachProfile?.displayName || detail.clientProfile?.displayName || detail.email.split("@")[0]}</div>
                  <div style={{ fontSize: 12, color: C.mt }}>{detail.email}</div>
                </div>
                <Badge color={ROLE_COLORS[detail.role]}>{detail.role}</Badge>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12, color: C.mt }}>
                <div>Status: <b style={{ color: detail.isActive ? C.ok : C.dg }}>{detail.isActive ? "Active" : "Deactivated"}</b></div>
                <div>Email verified: <b style={{ color: detail.emailVerified ? C.ok : C.wn }}>{detail.emailVerified ? "Yes" : "No"}</b></div>
                <div>Joined: {new Date(detail.createdAt).toLocaleDateString()}</div>
                <div>Last login: {detail.lastLogin ? new Date(detail.lastLogin).toLocaleDateString() : "Never"}</div>
                {detail.subscription && <div>Tier: {detail.subscription.tier} ({detail.subscription.maxClients} max clients)</div>}
                <div>Active sessions: {detail._count?.sessions ?? 0}</div>
              </div>
            </Card>

            {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
            {isSelf && <div style={{ color: C.wn, fontSize: 12, padding: "10px 14px", background: C.wn + "15", borderRadius: 10, marginBottom: 12 }}>This is your own account — role and deactivation changes are blocked for safety.</div>}

            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 12 }}>Role (RBAC)</div>
              <Sel value={detail.role} disabled={isSelf || saving} onChange={e => updateUser({ role: e.target.value })} options={[{ value: "CLIENT", label: "Client" }, { value: "COACH", label: "Coach" }, { value: "ADMIN", label: "Admin" }]} />
              <div style={{ fontSize: 11, color: C.mt, marginTop: 8 }}>Changing role force-signs the user out everywhere, so they re-authenticate under their new permissions.</div>
            </Card>

            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Account Status</div>
                <button disabled={isSelf || saving} onClick={() => updateUser({ isActive: !detail.isActive })} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: isSelf ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, opacity: isSelf ? .5 : 1, background: detail.isActive ? C.dg + "20" : C.ok + "20", color: detail.isActive ? C.dg : C.ok }}>{detail.isActive ? "Deactivate" : "Reactivate"}</button>
              </div>
            </Card>

            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Session Control</div>
              <Btn variant="secondary" onClick={forceLogout} style={{ width: "100%" }}>🔒 Force logout everywhere ({detail._count?.sessions ?? 0} active)</Btn>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <ST>Admin — Users</ST>
      <Tabs tabs={[{ id: "", label: "All" }, { id: "COACH", label: "Coaches" }, { id: "CLIENT", label: "Clients" }, { id: "ADMIN", label: "Admins" }]} active={roleFilter} onChange={setRoleFilter} />
      <Input placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 14 }} />
      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      {loading ? <Spin /> : users.length === 0 ? <Empty icon="👤" text="No users found" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map(u => (
            <Card key={u.id} onClick={() => openDetail(u)} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{u.displayName[0].toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{u.displayName}</div>
                <div style={{ fontSize: 12, color: C.mt }}>{u.email}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <Badge color={ROLE_COLORS[u.role]} style={{ fontSize: 10 }}>{u.role}</Badge>
                {!u.isActive && <Badge color={C.dg} style={{ fontSize: 9 }}>Deactivated</Badge>}
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
