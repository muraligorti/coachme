// ═══════════════════════════════════════════════════════════════════════
// ADMIN GYMS — create gyms, add/remove coach members, and assign coaches
// to clients within a gym. All the actual tenant-isolation logic lives
// server-side (organizationService.js) - this is just the UI for it.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Card, Badge, Btn, Input, Sel, Empty, Spin, ST, Modal } from "../../components/ui.jsx";

export default function AdminGymsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", tier: "STARTER", maxClients: 25, city: "", country: "" });
  const [sel, setSel] = useState(null); // selected gym id
  const [detail, setDetail] = useState(null); // { org, members, coaches, clients }
  const [detailLoading, setDetailLoading] = useState(false);

  const createGym = async () => {
    if (!form.name.trim()) { setError("Gym name is required"); return; }
    setError("");
    try {
      const org = await api.post("/organizations", form);
      setShowCreate(false);
      setForm({ name: "", tier: "STARTER", maxClients: 25, city: "", country: "" });
      openGym(org.id);
    } catch (e) { setError(e.message); }
  };

  const openGym = async (orgId) => {
    setSel(orgId); setDetail(null); setDetailLoading(true); setError("");
    try {
      const [org, members, coaches, clients] = await Promise.all([
        api.get(`/organizations/${orgId}`),
        api.get(`/organizations/${orgId}/members`),
        api.get(`/organizations/${orgId}/coaches`),
        api.get(`/organizations/${orgId}/clients`),
      ]);
      setDetail({ org, members, coaches, clients });
    } catch (e) { setError(e.message); }
    setDetailLoading(false);
  };

  const refreshDetail = () => { if (sel) openGym(sel); };

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("COACH");
  const addMember = async () => {
    setError("");
    try {
      // Looking up a user by email isn't a dedicated endpoint yet -
      // reusing admin's user search, which already exists.
      const search = await api.get(`/admin/users?search=${encodeURIComponent(memberEmail)}`);
      const match = search.users?.find(u => u.email === memberEmail.trim().toLowerCase());
      if (!match) { setError("No user found with that exact email"); return; }
      await api.post(`/organizations/${sel}/members`, { userId: match.id, role: memberRole });
      setMemberEmail("");
      refreshDetail();
    } catch (e) { setError(e.message); }
  };

  const removeMember = async (userId) => {
    if (!confirm("Remove this member from the gym?")) return;
    try { await api.del(`/organizations/${sel}/members/${userId}`); refreshDetail(); }
    catch (e) { setError(e.message); }
  };

  const [clientEmail, setClientEmail] = useState("");
  const attachClient = async () => {
    setError("");
    try {
      const search = await api.get(`/admin/users?search=${encodeURIComponent(clientEmail)}`);
      const match = search.users?.find(u => u.email === clientEmail.trim().toLowerCase() && u.role === "CLIENT");
      if (!match) { setError("No client found with that exact email"); return; }
      // The attach endpoint needs the ClientProfile id, not the User id -
      // the search result only gives us the user, so fetch full detail
      // to get clientProfile.id.
      const full = await api.get(`/admin/users/${match.id}`);
      if (!full.clientProfile?.id) { setError("This user has no client profile yet"); return; }
      await api.post(`/organizations/${sel}/clients/${full.clientProfile.id}/attach`);
      setClientEmail("");
      refreshDetail();
    } catch (e) { setError(e.message); }
  };

  const [assignClientId, setAssignClientId] = useState("");
  const [assignCoachId, setAssignCoachId] = useState("");
  const assignCoach = async () => {
    if (!assignClientId || !assignCoachId) return;
    try {
      await api.post(`/organizations/${sel}/clients/${assignClientId}/assign`, { coachId: assignCoachId });
      refreshDetail();
    } catch (e) { setError(e.message); }
  };

  if (sel) {
    return (
      <div>
        <button onClick={() => { setSel(null); setDetail(null); }} style={{ background: "none", border: "none", color: C.ac, cursor: "pointer", fontSize: 14, fontWeight: 600, marginBottom: 12, padding: 0 }}>← All Gyms</button>
        {detailLoading || !detail ? <Spin /> : (
          <>
            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>{detail.org.name}</div>
              <div style={{ fontSize: 12, color: C.mt, marginTop: 4 }}>{detail.org.tier} · {detail.clients.length}/{detail.org.maxClients} clients · {detail.coaches.length} coaches</div>
            </Card>

            {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}

            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Members</div>
              {detail.members.map(m => {
                // A "COACH" membership doesn't mean they've actually
                // completed their coach profile yet (displayName, city,
                // etc.) - and only a completed CoachProfile can be
                // assigned to a client. Cross-referencing here so this is
                // visible up front, instead of a confusing "coach not
                // found" error only surfacing later when assignment is
                // attempted.
                const hasProfile = m.role !== "COACH" || detail.coaches.some(c => c.userId === m.userId);
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.bd}` }}>
                    <div>
                      <div style={{ fontSize: 13, color: C.tx }}>{m.user.email}</div>
                      <div style={{ fontSize: 11, color: hasProfile ? C.mt : C.wn }}>
                        {m.role}{!hasProfile && " · ⚠ Hasn't completed their coach profile yet — can't be assigned to clients until they do"}
                      </div>
                    </div>
                    <button onClick={() => removeMember(m.userId)} style={{ background: "none", border: "none", color: C.dg, cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>Remove</button>
                  </div>
                );
              })}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Input value={memberEmail} onChange={e => setMemberEmail(e.target.value)} placeholder="coach's email" style={{ flex: 1 }} />
                <Sel value={memberRole} onChange={e => setMemberRole(e.target.value)} options={[{ value: "COACH", label: "Coach" }, { value: "ADMIN", label: "Gym Admin" }]} style={{ width: 110 }} />
                <Btn onClick={addMember} style={{ padding: "10px 14px", fontSize: 12 }}>Add</Btn>
              </div>
            </Card>

            <Card style={{ marginBottom: 12, padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Assign Coach to Client</div>
              {detail.clients.length === 0 || detail.coaches.length === 0 ? (
                <div style={{ fontSize: 12, color: C.mt }}>Need at least one coach and one client in this gym first.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Sel value={assignClientId} onChange={e => setAssignClientId(e.target.value)} options={[{ value: "", label: "— Select client —" }, ...detail.clients.map(c => ({ value: c.id, label: c.displayName }))]} />
                  <Sel value={assignCoachId} onChange={e => setAssignCoachId(e.target.value)} options={[{ value: "", label: "— Select coach —" }, ...detail.coaches.map(c => ({ value: c.id, label: c.displayName }))]} />
                  <Btn onClick={assignCoach} style={{ width: "100%" }}>Assign</Btn>
                </div>
              )}
            </Card>

            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 10 }}>Clients ({detail.clients.length})</div>
              {detail.clients.length === 0 ? <Empty icon="👥" text="No clients in this gym yet" /> : detail.clients.map(c => (
                <div key={c.id} style={{ fontSize: 13, color: C.tx, padding: "8px 0", borderBottom: `1px solid ${C.bd}` }}>{c.displayName}</div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client's email" style={{ flex: 1 }} />
                <Btn onClick={attachClient} style={{ padding: "10px 14px", fontSize: 12 }}>+ Attach Client</Btn>
              </div>
            </Card>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <ST right={<Btn onClick={() => setShowCreate(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Create Gym</Btn>}>Gyms</ST>
      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      <Card style={{ padding: 16 }}>
        <div style={{ fontSize: 13, color: C.mt }}>To open a gym you've already created, you'll need its ID for now (shown right after creation) — a full gym directory is a natural next addition once there are more than a few.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Input placeholder="paste gym ID" onKeyDown={e => { if (e.key === "Enter" && e.target.value) openGym(e.target.value.trim()); }} style={{ flex: 1 }} />
        </div>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Gym">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Gym Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Iron Fitness Studio" />
          <Sel label="Tier" value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value })} options={[{ value: "STARTER", label: "Starter" }, { value: "PRO", label: "Pro" }, { value: "ELITE", label: "Elite" }]} />
          <Input label="Max Clients" type="number" value={form.maxClients} onChange={e => setForm({ ...form, maxClients: +e.target.value })} />
          <Input label="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
          <Btn onClick={createGym} style={{ width: "100%" }}>Create</Btn>
        </div>
      </Modal>
    </div>
  );
}
