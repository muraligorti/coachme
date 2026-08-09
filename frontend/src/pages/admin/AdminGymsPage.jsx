// ═══════════════════════════════════════════════════════════════════════
// ADMIN GYMS — create gyms, add coaches as employees, create clients
// tagged to the gym, and assign coaches to clients. Deliberately NOT a
// "search for an existing user and attach them" flow - every coach and
// client here is created fresh, directly for this gym, so they're never
// a half-complete state discovered later. All the actual tenant
// isolation logic lives server-side (organizationService.js) - this is
// just the UI for it.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Card, Btn, Input, Sel, Empty, Spin, ST, Modal } from "../../components/ui.jsx";

export default function AdminGymsPage() {
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", tier: "STARTER", maxClients: 25, city: "", country: "" });
  const [sel, setSel] = useState(null); // selected gym id
  const [detail, setDetail] = useState(null); // { org, members, coaches, clients }
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAddCoach, setShowAddCoach] = useState(false);
  const [showAddClient, setShowAddClient] = useState(false);
  const [coachForm, setCoachForm] = useState({ name: "", email: "", phone: "", city: "", country: "" });
  const [clientForm, setClientForm] = useState({ name: "", email: "", phone: "", age: "", gender: "" });

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

  const removeMember = async (userId) => {
    if (!confirm("Remove this member from the gym? Their account isn't deleted, just detached.")) return;
    try { await api.del(`/organizations/${sel}/members/${userId}`); refreshDetail(); }
    catch (e) { setError(e.message); }
  };

  const createCoach = async () => {
    if (!coachForm.name.trim() || !coachForm.email.trim()) { setError("Coach name and email are required"); return; }
    setError("");
    try {
      await api.post(`/organizations/${sel}/coaches`, coachForm);
      setShowAddCoach(false);
      setCoachForm({ name: "", email: "", phone: "", city: "", country: "" });
      refreshDetail();
    } catch (e) { setError(e.message); }
  };

  const createClient = async () => {
    if (!clientForm.name.trim() || !clientForm.email.trim()) { setError("Client name and email are required"); return; }
    setError("");
    try {
      await api.post(`/organizations/${sel}/clients`, clientForm);
      setShowAddClient(false);
      setClientForm({ name: "", email: "", phone: "", age: "", gender: "" });
      refreshDetail();
    } catch (e) { setError(e.message); }
  };

  const [assignClientId, setAssignClientId] = useState("");
  const [assignCoachId, setAssignCoachId] = useState("");
  const assignCoach = async () => {
    if (!assignClientId || !assignCoachId) return;
    try {
      await api.post(`/organizations/${sel}/clients/${assignClientId}/assign`, { coachId: assignCoachId });
      setAssignClientId(""); setAssignCoachId("");
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Coaches ({detail.coaches.length})</div>
                <button onClick={() => setShowAddCoach(true)} style={{ fontSize: 12, color: C.ac, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>+ Add Coach</button>
              </div>
              {detail.coaches.length === 0 ? <div style={{ fontSize: 12, color: C.mt }}>No coaches yet.</div> : detail.members.filter(m => m.role === "COACH").map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${C.bd}` }}>
                  <div style={{ fontSize: 13, color: C.tx }}>{m.user.email}</div>
                  <button onClick={() => removeMember(m.userId)} style={{ background: "none", border: "none", color: C.dg, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Remove</button>
                </div>
              ))}
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Clients ({detail.clients.length})</div>
                <button onClick={() => setShowAddClient(true)} style={{ fontSize: 12, color: C.ac, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>+ Add Client</button>
              </div>
              {detail.clients.length === 0 ? <Empty icon="👥" text="No clients in this gym yet" /> : detail.clients.map(c => (
                <div key={c.id} style={{ fontSize: 13, color: C.tx, padding: "8px 0", borderBottom: `1px solid ${C.bd}` }}>{c.displayName}</div>
              ))}
            </Card>

            <Modal open={showAddCoach} onClose={() => setShowAddCoach(false)} title="Add Coach">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, color: C.mt }}>Creates a new coach account directly for this gym — not a search for an existing user. They'll set their own password via the forgot-password flow using this email.</div>
                <Input label="Full Name" value={coachForm.name} onChange={e => setCoachForm({ ...coachForm, name: e.target.value })} placeholder="Priya Sharma" />
                <Input label="Email" type="email" value={coachForm.email} onChange={e => setCoachForm({ ...coachForm, email: e.target.value })} placeholder="priya@email.com" />
                <Input label="Phone" value={coachForm.phone} onChange={e => setCoachForm({ ...coachForm, phone: e.target.value })} placeholder="9876543210" />
                <Input label="City" value={coachForm.city} onChange={e => setCoachForm({ ...coachForm, city: e.target.value })} placeholder={detail.org.city || "Hyderabad"} />
                {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
                <Btn onClick={createCoach} style={{ width: "100%" }}>Create Coach</Btn>
              </div>
            </Modal>

            <Modal open={showAddClient} onClose={() => setShowAddClient(false)} title="Add Client">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 12, color: C.mt }}>Creates a new client account directly for this gym.</div>
                <Input label="Full Name" value={clientForm.name} onChange={e => setClientForm({ ...clientForm, name: e.target.value })} placeholder="Rohan Mehta" />
                <Input label="Email" type="email" value={clientForm.email} onChange={e => setClientForm({ ...clientForm, email: e.target.value })} placeholder="rohan@email.com" />
                <Input label="Phone" value={clientForm.phone} onChange={e => setClientForm({ ...clientForm, phone: e.target.value })} placeholder="9876543210" />
                <Input label="Age" type="number" value={clientForm.age} onChange={e => setClientForm({ ...clientForm, age: e.target.value })} />
                {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
                <Btn onClick={createClient} style={{ width: "100%" }}>Create Client</Btn>
              </div>
            </Modal>
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
