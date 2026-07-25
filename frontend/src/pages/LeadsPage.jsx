// ═══════════════════════════════════════════════════════════════════════
// LEADS — sales pipeline as a Kanban board or list, with local-storage
// fallback if the backend /leads routes aren't reachable (e.g. below
// PRO tier, or a fresh deployment still being configured).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap } from "../lib/utils.js";
import { Card, Badge, Btn, Input, TextArea, Sel, Modal, ST, Spin } from "../components/ui.jsx";

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [view, setView] = useState("kanban");
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "website", notes: "" });

  const load = () => api.get("/leads").then(d => {
    const apiLeads = unwrap(d, "leads");
    const localLeads = ls.get("local_leads", []);
    setLeads([...apiLeads, ...localLeads.filter(ll => !apiLeads.some(al => al.id === ll.id))]);
  }).catch(() => { setLeads(ls.get("local_leads", [])); }).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const addLead = async () => {
    try { await api.post("/leads", form); }
    catch (e) {
      if (e.message.includes("404") || e.message.includes("Not found")) {
        const localLeads = ls.get("local_leads", []);
        localLeads.push({ ...form, id: `lead_${Date.now()}`, status: "new", createdAt: new Date().toISOString() });
        ls.set("local_leads", localLeads);
      } else { alert(e.message); return; }
    }
    setForm({ name: "", email: "", phone: "", source: "website", notes: "" }); setShowAdd(false); load();
  };

  const stages = [{ id: "new", label: "New", color: C.a2 }, { id: "contacted", label: "Contacted", color: C.wn }, { id: "qualified", label: "Qualified", color: C.ac }, { id: "converted", label: "Converted", color: C.ok }, { id: "lost", label: "Lost", color: C.dg }];

  const updateSt = async (id, st) => {
    if (String(id).startsWith("lead_")) {
      const local = ls.get("local_leads", []).map(l => l.id === id ? { ...l, status: st } : l);
      ls.set("local_leads", local); load(); return;
    }
    try { await api.put(`/leads/${id}`, { status: st }); load(); }
    catch { const local = ls.get("local_leads", []).map(l => l.id === id ? { ...l, status: st } : l); ls.set("local_leads", local); load(); }
  };

  if (loading) return <Spin />;

  return (
    <div>
      <ST right={<div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => setView("kanban")} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: view === "kanban" ? C.ac : C.s2, color: view === "kanban" ? "#fff" : C.mt }}>Board</button>
        <button onClick={() => setView("list")} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: view === "list" ? C.ac : C.s2, color: view === "list" ? "#fff" : C.mt }}>List</button>
        <Btn onClick={() => setShowAdd(true)} style={{ padding: "6px 14px", fontSize: 12 }}>+ Lead</Btn>
      </div>}>Leads</ST>
      {view === "kanban" ? (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }}>
          {stages.map(st => {
            const sl = leads.filter(l => (l.status || "new") === st.id);
            return (
              <div key={st.id} style={{ minWidth: 180, flex: "0 0 180px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: st.color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{st.label}</span>
                  <Badge style={{ fontSize: 10, padding: "2px 8px" }}>{sl.length}</Badge>
                </div>
                {sl.map(l => (
                  <Card key={l.id} style={{ padding: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 4 }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: C.mt }}>{l.email}</div>
                    {l.source && <Badge style={{ marginTop: 6, fontSize: 10 }} color={C.mt}>{l.source}</Badge>}
                    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                      {stages.filter(s => s.id !== st.id && s.id !== "lost").slice(0, 2).map(s => <button key={s.id} onClick={() => updateSt(l.id, s.id)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 600, cursor: "pointer", background: s.color + "20", color: s.color }}>→ {s.label}</button>)}
                    </div>
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {leads.map(l => (
            <Card key={l.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ color: C.tx, fontSize: 14, fontWeight: 600 }}>{l.name}</div><div style={{ color: C.mt, fontSize: 12 }}>{l.email}</div></div>
              <Badge color={stages.find(s => s.id === (l.status || "new"))?.color}>{l.status || "new"}</Badge>
            </Card>
          ))}
        </div>
      )}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Lead">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <Sel label="Source" value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} options={[{ value: "website", label: "Website" }, { value: "referral", label: "Referral" }, { value: "instagram", label: "Instagram" }, { value: "other", label: "Other" }]} />
          <TextArea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <Btn onClick={addLead} style={{ width: "100%" }}>Save Lead</Btn>
        </div>
      </Modal>
    </div>
  );
}
