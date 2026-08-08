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
  const [rbac, setRbac] = useState(null);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingContact, setEditingContact] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [phoneValue, setPhoneValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
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
    setSel(u); setDetail(null); setRbac(null); setDetailLoading(true); setError("");
    api.get(`/admin/users/${u.id}`).then(setDetail).catch(e => setError(e.message)).finally(() => setDetailLoading(false));
    api.get(`/rbac/${u.id}`).then(r => { setRbac(r); setCategoryDraft(r.category || ""); }).catch(() => {});
  };

  const toggleFeature = async (key, currentValue) => {
    try { const r = await api.req(`/rbac/${sel.id}/flags`, { method: "PATCH", body: JSON.stringify({ [key]: !currentValue }) }); setRbac(r); }
    catch (e) { alert("Failed to update: " + e.message); }
  };

  const saveCategory = async () => {
    try { const r = await api.req(`/rbac/${sel.id}/category`, { method: "PATCH", body: JSON.stringify({ category: categoryDraft }) }); setRbac(r); }
    catch (e) { alert("Failed to save category: " + e.message); }
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

  const setTier = async (tier) => {
    setSaving(true); setError("");
    try { await api.req(`/admin/users/${sel.id}/tier`, { method: "PATCH", body: JSON.stringify({ tier }) }); const fresh = await api.get(`/admin/users/${sel.id}`); setDetail(fresh); }
    catch (e) { setError(e.message); }
    setSaving(false);
  };

  const forceLogout = async () => {
    if (!confirm(`Sign ${detail.email} out of all devices?`)) return;
    try { const r = await api.post(`/admin/users/${sel.id}/force-logout`); alert(r.message); } catch (e) { alert("Failed: " + e.message); }
  };

  const updatePhone = async (phone) => {
    setSaving(true); setError("");
    try { const updated = await api.req(`/admin/users/${sel.id}/phone`, { method: "PATCH", body: JSON.stringify({ phone }) }); setDetail(updated); }
    catch (e) { setError(e.message); }
    setSaving(false);
  };

  const saveContact = async () => {
    setSaving(true); setError("");
    try {
      const currentPhone = detail.coachProfile?.phone || detail.clientProfile?.phone || "";
      if (emailValue !== detail.email) {
        const updated = await api.req(`/admin/users/${sel.id}`, { method: "PATCH", body: JSON.stringify({ email: emailValue }) });
        setDetail(d => ({ ...d, ...updated }));
      }
      if (phoneValue !== currentPhone) {
        const updated = await api.req(`/admin/users/${sel.id}/phone`, { method: "PATCH", body: JSON.stringify({ phone: phoneValue }) });
        setDetail(updated);
      }
      setEditingContact(false);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const deleteUserAccount = async () => {
    if (detail.email !== deleteConfirmText) { setError("Type the exact email address to confirm deletion"); return; }
    setSaving(true); setError("");
    try {
      await api.req(`/admin/users/${sel.id}`, { method: "DELETE" });
      setSel(null); setDetail(null); setDeleteConfirmText(""); setShowDeleteConfirm(false);
      load();
    } catch (e) {
      if (e.message.includes("active client")) {
        if (confirm(e.message + "\n\nDelete anyway? This permanently removes their bookings, workout plans, and history too.")) {
          try {
            await api.req(`/admin/users/${sel.id}`, { method: "DELETE", body: JSON.stringify({ confirmDespiteActiveClients: true }) });
            setSel(null); setDetail(null); setDeleteConfirmText(""); setShowDeleteConfirm(false);
            load();
          } catch (e2) { setError(e2.message); }
        }
      } else setError(e.message);
    }
    setSaving(false);
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

            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editingContact ? 12 : 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Contact Info</div>
                {!editingContact && (
                  <button onClick={() => { setEmailValue(detail.email); setPhoneValue(detail.coachProfile?.phone || detail.clientProfile?.phone || ""); setEditingContact(true); setError(""); }} style={{ fontSize: 12, color: C.ac, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Edit</button>
                )}
              </div>
              {!editingContact ? (
                <div style={{ fontSize: 12, color: C.mt, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div>Email: <span style={{ color: C.tx }}>{detail.email}</span></div>
                  <div>Phone: <span style={{ color: C.tx }}>{detail.coachProfile?.phone || detail.clientProfile?.phone || "Not set"}</span></div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Input label="Email" type="email" value={emailValue} onChange={e => setEmailValue(e.target.value)} />
                  <Input label="Phone" value={phoneValue} onChange={e => setPhoneValue(e.target.value)} placeholder="9876543210" />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn onClick={saveContact} disabled={saving} style={{ flex: 1 }}>{saving ? "Saving…" : "Save"}</Btn>
                    <Btn variant="secondary" onClick={() => { setEditingContact(false); setError(""); }} style={{ flex: 1 }}>Cancel</Btn>
                  </div>
                </div>
              )}
            </Card>

            {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
            {isSelf && <div style={{ color: C.wn, fontSize: 12, padding: "10px 14px", background: C.wn + "15", borderRadius: 10, marginBottom: 12 }}>This is your own account — role and deactivation changes are blocked for safety.</div>}

            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 12 }}>Role (RBAC)</div>
              <Sel value={detail.role} disabled={isSelf || saving} onChange={e => updateUser({ role: e.target.value })} options={[{ value: "CLIENT", label: "Client" }, { value: "COACH", label: "Coach" }, { value: "ADMIN", label: "Admin" }]} />
              <div style={{ fontSize: 11, color: C.mt, marginTop: 8 }}>Changing role force-signs the user out everywhere, so they re-authenticate under their new permissions.</div>
            </Card>

            {detail.role === "COACH" && (
              <Card style={{ marginBottom: 12, padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 12 }}>Subscription Tier</div>
                <Sel value={detail.subscription?.tier || "FREE"} disabled={saving} onChange={e => setTier(e.target.value)} options={[{ value: "FREE", label: "Free (5 clients)" }, { value: "STARTER", label: "Starter (5 clients)" }, { value: "PRO", label: "Pro (50 clients)" }, { value: "ELITE", label: "Elite (unlimited)" }, { value: "PREMIUM", label: "Premium (unlimited)" }]} />
                {detail.coachProfile?.specializations?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: C.mt, marginBottom: 6 }}>Self-reported specialization:</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {detail.coachProfile.specializations.map(s => <Badge key={s} color={C.a2} style={{ fontSize: 10 }}>{s}</Badge>)}
                    </div>
                  </div>
                )}
              </Card>
            )}

            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Account Status</div>
                <button disabled={isSelf || saving} onClick={() => updateUser({ isActive: !detail.isActive })} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: isSelf ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 700, opacity: isSelf ? .5 : 1, background: detail.isActive ? C.dg + "20" : C.ok + "20", color: detail.isActive ? C.dg : C.ok }}>{detail.isActive ? "Deactivate" : "Reactivate"}</button>
              </div>
            </Card>

            {rbac && (rbac.availableKeys && Object.keys(rbac.availableKeys).length > 0) && (
              <>
                <Card style={{ marginBottom: 12, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Profile Category</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input value={categoryDraft} onChange={e => setCategoryDraft(e.target.value)} placeholder={detail.role === "COACH" ? "e.g. Strength & Conditioning" : "e.g. Weight Loss"} style={{ flex: 1 }} />
                    <Btn onClick={saveCategory} style={{ padding: "0 18px" }}>Save</Btn>
                  </div>
                  <div style={{ fontSize: 11, color: C.mt, marginTop: 6 }}>Organizational only — free text, not tied to any specific behavior yet.</div>
                </Card>
                <Card style={{ marginBottom: 12, padding: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>Feature Access</div>
                  <div style={{ fontSize: 11, color: C.mt, marginBottom: 10 }}>Core navigation can't be restricted — only these optional features.</div>
                  {Object.entries(rbac.availableKeys).map(([key, label]) => (
                    <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.bd}` }}>
                      <span style={{ fontSize: 13, color: C.tx }}>{label}</span>
                      <button onClick={() => toggleFeature(key, rbac.flags[key])} style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: rbac.flags[key] ? C.ok : C.bd, position: "relative", transition: "all .2s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: rbac.flags[key] ? 23 : 3, transition: "left .2s", boxShadow: "0 1px 2px rgba(0,0,0,.3)" }} />
                      </button>
                    </div>
                  ))}
                </Card>
              </>
            )}

            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Session Control</div>
              <Btn variant="secondary" onClick={forceLogout} style={{ width: "100%" }}>🔒 Force logout everywhere ({detail._count?.sessions ?? 0} active)</Btn>
            </Card>

            {!isSelf && (
              <Card style={{ marginBottom: 12, padding: 16, border: `1px solid ${C.dg}40` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dg, marginBottom: 4 }}>⚠️ Danger Zone</div>
                <div style={{ fontSize: 11, color: C.mt, marginBottom: 12 }}>Permanently deletes this account and everything tied to it — bookings, workout plans, check-ins, invoices, history. This cannot be undone.</div>
                {!showDeleteConfirm ? (
                  <Btn variant="danger" onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); setError(""); }} style={{ width: "100%" }}>Delete This Account</Btn>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, color: C.tx }}>Type <b style={{ fontFamily: "monospace" }}>{detail.email}</b> to confirm:</div>
                    <Input value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} placeholder={detail.email} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn variant="danger" onClick={deleteUserAccount} disabled={saving || deleteConfirmText !== detail.email} style={{ flex: 1 }}>{saving ? "Deleting…" : "Permanently Delete"}</Btn>
                      <Btn variant="secondary" onClick={() => setShowDeleteConfirm(false)} style={{ flex: 1 }}>Cancel</Btn>
                    </div>
                  </div>
                )}
              </Card>
            )}
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
