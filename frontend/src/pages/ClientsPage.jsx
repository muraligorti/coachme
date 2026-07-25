// ═══════════════════════════════════════════════════════════════════════
// CLIENTS — roster list (with AI risk-flag badges), client detail view
// with sub-tabs (Overview/Progress/Habits/Nutrition/Check-ins/Media),
// add/edit forms, and CSV bulk import.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap, cName, cEmail } from "../lib/utils.js";
import { Card, Badge, Btn, Input, TextArea, Sel, Modal, Empty, Spin, ST, SC, Tabs } from "../components/ui.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";
import ProgressTracker from "./ProgressTracker.jsx";
import HabitTracker from "./HabitTracker.jsx";
import NutritionTracker from "./NutritionTracker.jsx";
import CheckInsPage from "./CheckInsPage.jsx";
import MediaLibrary from "./MediaLibrary.jsx";

// Lightweight, read-only view of a single client's assigned workout
// plan(s) — lives here (not the full WorkoutsPage) because a coach
// looking at one client's profile shouldn't have to leave it to see
// what they're programmed on. "Edit" still routes to the full
// Workouts screen, which remains the single place plans are authored.
function ClientWorkoutsTab({ clientId }) {
  const [plans, setPlans] = useState(null);
  useEffect(() => {
    api.get("/workouts/plans").then(d => {
      const all = unwrap(d, "plans");
      setPlans(all.filter(p => p.clientId === clientId));
    }).catch(() => setPlans([]));
  }, [clientId]);
  if (plans === null) return <Spin />;
  if (plans.length === 0) return <Empty icon="💪" text="No workout plan assigned yet — create one from the Workouts tab and assign it to this client." />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {plans.map(p => (
        <Card key={p.id} style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>{p.title || p.name}</div>
            <Badge color={p.status === "active" ? C.ok : C.mt}>{p.status || "draft"}</Badge>
          </div>
          {p.description && <div style={{ color: C.mt, fontSize: 12, marginTop: 4 }}>{p.description}</div>}
          {p.exercises && Array.isArray(p.exercises) && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {p.exercises.map((ex, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: i < p.exercises.length - 1 ? `1px solid ${C.bd}` : "none" }}>
                  <span style={{ color: C.tx, fontWeight: 500 }}>{ex.name || ex}</span>
                  {ex.sets && <span style={{ color: C.mt }}>{ex.sets} × {ex.reps} · rest {ex.rest}s</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function ClientsPage({ deepLink, onConsumeDeepLink }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [risks, setRisks] = useState({});
  const [clientsWithPlans, setClientsWithPlans] = useState(new Set());
  const [expandedRisk, setExpandedRisk] = useState(null);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("overview");
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", sessionType: "offline", goals: "", notes: "", emergencyContact: "", address: "", dob: "", gender: "", injuries: "" });
  const emptyForm = { name: "", email: "", phone: "", sessionType: "offline", goals: "", notes: "", emergencyContact: "", address: "", dob: "", gender: "", injuries: "" };

  const load = () => api.get("/clients").then(d => {
    const raw = unwrap(d, "clients");
    const edits = ls.get("client_edits", {});
    const merged = raw.map(c => { const e = edits[c.id]; return e ? { ...c, ...e, name: e.displayName || e.name || c.displayName || c.name } : c; });
    setClients(merged);
  }).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get("/insights/client-risks").then(d => setRisks(d?.risks || {})).catch(() => {});
    // One call for the whole roster, rather than N+1 — powers the "💪" quick-jump
    // badge on each client card so the coach can see who's mapped to a plan
    // and jump straight to it, without opening every client individually.
    api.get("/workouts/plans").then(d => setClientsWithPlans(new Set(unwrap(d, "plans").map(p => p.clientId)))).catch(() => {});
  }, []);

  // Deep-link support: e.g. Schedule's "View Workout" button on a booking
  // navigates here with {clientId, tab:"workouts"} so the coach lands
  // directly on that client's workout plan instead of the roster list.
  useEffect(() => {
    if (!deepLink?.clientId || clients.length === 0) return;
    const target = clients.find(c => c.id === deepLink.clientId);
    if (target) { setSel(target); setTab(deepLink.tab || "overview"); }
    onConsumeDeepLink?.();
  }, [deepLink, clients]);

  const filtered = clients.filter(c => (cName(c) || "").toLowerCase().includes(search.toLowerCase()) || (cEmail(c) || "").toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search));

  const addClient = async () => { if (!form.name) { alert("Name is required"); return; } if (!form.email) { alert("Email is required"); return; } try { await api.post("/clients", form); setForm(emptyForm); setShowAdd(false); load(); } catch (e) { alert("Add client failed: " + e.message); } };

  const editClient = async () => {
    const updateData = { ...form, displayName: form.name };
    const paths = [`/clients/${sel.id}`, `/coaches/clients/${sel.id}`, `/clients/${sel.userId || sel.id}`];
    let success = false;
    for (const path of paths) {
      try { await api.put(path, updateData); success = true; break; }
      catch (e) { if (!e.message.includes("404") && !e.message.includes("Not found")) throw e; }
    }
    if (!success) {
      const edits = ls.get("client_edits", {});
      edits[sel.id] = { ...updateData, _editedAt: new Date().toISOString() };
      ls.set("client_edits", edits);
    }
    setShowEdit(false); load();
    const updated = { ...sel, ...form, displayName: form.name }; setSel(updated);
  };

  const deleteClient = async (id) => { if (!confirm("Delete this client? This cannot be undone.")) return; try { await api.del(`/clients/${id}`); setSel(null); load(); } catch (e) { alert(e.message); } };

  const bulkUpload = async () => {
    try {
      const rows = csvText.trim().split("\n").filter(r => r.trim());
      if (rows.length < 2) { alert("Need header row + data rows"); return; }
      const headers = rows[0].split(",").map(h => h.trim().toLowerCase());
      const data = rows.slice(1).map(r => { const vals = r.split(","); const obj = {}; headers.forEach((h, i) => { const key = h === "mobile" || h === "phone number" ? "phone" : h === "full name" ? "name" : h; obj[key] = vals[i]?.trim() || ""; }); return obj; });
      try { await api.post("/clients/bulk", { clients: data }); } catch { for (const c of data) { try { await api.post("/clients", c); } catch {} } }
      setCsvText(""); setShowBulk(false); load();
    } catch (e) { alert("Upload error: " + e.message); }
  };

  const handlePhotoUpload = async (e, type) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("type", type); fd.append("clientId", sel.id);
    try { await api.upload(`/clients/${sel.id}/photo`, fd); load(); } catch {
      const reader = new FileReader(); reader.onload = ev => {
        const photos = ls.get(`photos_${sel.id}`, {}); photos[type] = ev.target.result;
        ls.set(`photos_${sel.id}`, photos); setSel({ ...sel, _photos: photos });
      }; reader.readAsDataURL(file);
    }
  };

  if (loading) return <Spin />;

  if (sel) {
    const nm = cName(sel); const photos = ls.get(`photos_${sel.id}`, {});
    return (
      <div>
        <button onClick={() => setSel(null)} style={{ background: "none", border: "none", color: C.ac, cursor: "pointer", fontSize: 14, fontWeight: 600, marginBottom: 12, padding: 0, fontFamily: "inherit" }}>← Back</button>
        <Card style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            {photos.profile ? <img src={photos.profile} style={{ width: 56, height: 56, borderRadius: 16, objectFit: "cover" }} /> :
              <div style={{ width: 56, height: 56, borderRadius: 16, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff" }}>{nm[0].toUpperCase()}</div>}
            <label style={{ position: "absolute", bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, background: C.ac, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 10, color: "#fff", border: `2px solid ${C.sf}` }}>📷<input type="file" accept="image/*" onChange={e => handlePhotoUpload(e, "profile")} style={{ display: "none" }} /></label>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>{nm}</div>
            <div style={{ fontSize: 13, color: C.mt }}>{cEmail(sel)}</div>
            {sel.phone && <div style={{ fontSize: 12, color: C.mt }}>📱 {sel.phone}</div>}
            <Badge color={sel.sessionType === "online" ? C.a2 : C.ac} style={{ marginTop: 4 }}>{sel.sessionType || "offline"}</Badge>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button onClick={() => { setForm({ name: cName(sel) || "", email: cEmail(sel) || "", phone: sel.phone || "", sessionType: sel.sessionType || "offline", goals: sel.goals || "", notes: sel.notes || "", emergencyContact: sel.emergencyContact || "", address: sel.address || "", dob: sel.dob || "", gender: sel.gender || "", injuries: sel.injuries || "" }); setShowEdit(true); }} style={{ width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer", background: C.wn + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✏️</button>
            <button onClick={() => deleteClient(sel.id)} style={{ width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer", background: C.dg + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🗑️</button>
          </div>
        </Card>

        <Card style={{ marginBottom: 12, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 8 }}>Details</div>
          {[{ l: "Goals", v: sel.goals }, { l: "Gender", v: sel.gender }, { l: "DOB", v: sel.dob }, { l: "Address", v: sel.address }, { l: "Emergency Contact", v: sel.emergencyContact }, { l: "Injuries/Notes", v: sel.injuries || sel.notes }].filter(x => x.v).map(x => (
            <div key={x.l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: `1px solid ${C.bd}` }}>
              <span style={{ color: C.mt }}>{x.l}</span><span style={{ color: C.tx, fontWeight: 500, maxWidth: "60%", textAlign: "right" }}>{x.v}</span>
            </div>
          ))}
        </Card>

        <Tabs tabs={[{ id: "overview", label: "Overview" }, { id: "workouts", label: "Workouts" }, { id: "progress", label: "Progress" }, { id: "habits", label: "Habits" }, { id: "nutrition", label: "Nutrition" }, { id: "checkins", label: "Check-ins" }, { id: "media", label: "Media" }]} active={tab} onChange={setTab} />
        {tab === "overview" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><SC label="Sessions" value={sel.totalSessions ?? 0} icon="📅" color={C.ac} /><SC label="Streak" value={`${sel.streak ?? 0}d`} icon="🔥" color={C.or} /><SC label="Compliance" value={`${sel.compliance ?? 0}%`} icon="✅" color={C.ok} /><SC label="Goal Progress" value={`${sel.goalProgress ?? 0}%`} icon="🎯" color={C.a2} /></div>}
        {tab === "workouts" && <ClientWorkoutsTab clientId={sel.id} />}
        {tab === "progress" && <ProgressTracker cid={sel.id} />}
        {tab === "habits" && <HabitTracker cid={sel.id} />}
        {tab === "nutrition" && <NutritionTracker cid={sel.id} />}
        {tab === "checkins" && <CheckInsPage />}
        {tab === "media" && <MediaLibrary clientId={sel.id} clientName={nm} />}

        <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Client" wide>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Input label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /><Input label="Email *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><PhoneInput label="Mobile *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /><Sel label="Session Type" value={form.sessionType} onChange={e => setForm({ ...form, sessionType: e.target.value })} options={[{ value: "offline", label: "Offline (In-person)" }, { value: "online", label: "Online (Virtual)" }, { value: "hybrid", label: "Hybrid" }]} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} /><Sel label="Gender" value={form.gender || ""} onChange={e => setForm({ ...form, gender: e.target.value })} options={[{ value: "", label: "— Select —" }, { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]} /></div>
            <Input label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            <TextArea label="Goals" value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} placeholder="e.g. Lose 10kg, Build muscle" />
            <Input label="Emergency Contact" value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Name - Phone" />
            <TextArea label="Injuries / Medical Notes" value={form.injuries} onChange={e => setForm({ ...form, injuries: e.target.value })} placeholder="Any injuries or medical conditions" />
            <Btn onClick={editClient} style={{ width: "100%" }}>Save Changes</Btn>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      <ST right={<div style={{ display: "flex", gap: 6 }}>
        <Btn variant="secondary" onClick={() => setShowBulk(true)} style={{ padding: "8px 12px", fontSize: 12 }}>📤 Import</Btn>
        <Btn onClick={() => { setForm(emptyForm); setShowAdd(true); }} style={{ padding: "8px 14px", fontSize: 13 }}>+ Add Client</Btn>
      </div>}>Clients</ST>
      <Input placeholder="Search by name, email, or phone…" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 14 }} />
      {filtered.length === 0 ? <Empty icon="👥" text="No clients found" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(c => {
            const isOnline = c.lastLogin && (Date.now() - new Date(c.lastLogin).getTime()) < 15 * 60 * 1000;
            const lastSeen = c.lastLogin ? new Date(c.lastLogin) : c.lastActive ? new Date(c.lastActive) : null;
            const lastSeenText = lastSeen ? ((Date.now() - lastSeen.getTime()) < 60 * 60 * 1000 ? `${Math.round((Date.now() - lastSeen.getTime()) / 60000)}m ago` : lastSeen.toLocaleDateString()) : "Never";
            const risk = risks[c.id]; const isExpanded = expandedRisk === c.id; const hasPlan = clientsWithPlans.has(c.id);
            return (
              <Card key={c.id} onClick={() => setSel(c)} style={{ padding: 14, cursor: "pointer", ...(risk?.flagged ? { borderColor: C.wn + "60" } : {}) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff" }}>{(cName(c))[0].toUpperCase()}</div>
                    <div style={{ position: "absolute", bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, border: `2px solid ${C.sf}`, background: isOnline ? C.ok : C.mt }} title={isOnline ? "Online" : "Offline"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: C.tx, fontSize: 14, fontWeight: 600 }}>{cName(c)}</div>
                    <div style={{ color: C.mt, fontSize: 12 }}>{cEmail(c)}{c.phone ? ` · ${c.phone}` : ""}</div>
                    <div style={{ color: C.mt, fontSize: 10, marginTop: 2 }}>{isOnline ? <span style={{ color: C.ok }}>Online</span> : <span>Last seen: {lastSeenText}</span>}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <Badge color={c.status === "active" ? C.ok : C.mt} style={{ fontSize: 10 }}>{c.status || "active"}</Badge>
                    {hasPlan && <button onClick={e => { e.stopPropagation(); setSel(c); setTab("workouts"); }} style={{ display: "flex", alignItems: "center", gap: 3, background: C.ac + "18", color: C.ac, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, border: "none", cursor: "pointer" }} title="Jump to their workout plan">💪 Workout</button>}
                    {risk?.flagged && <button onClick={e => { e.stopPropagation(); setExpandedRisk(isExpanded ? null : c.id); }} style={{ display: "flex", alignItems: "center", gap: 3, background: C.wn + "20", color: C.wn, fontSize: 10, fontWeight: 700, padding: "4px 9px", borderRadius: 20, border: "none", cursor: "pointer" }}>⚠️ Needs attention <span style={{ opacity: .7 }}>{isExpanded ? "▴" : "▾"}</span></button>}
                  </div>
                </div>
                {risk?.flagged && isExpanded && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.bd}` }}>
                    {risk.reasons.map((r, i) => <div key={i} style={{ color: C.mt, fontSize: 11.5, lineHeight: 1.5, paddingLeft: 14, position: "relative", marginBottom: 3 }}><span style={{ position: "absolute", left: 0, color: C.wn }}>—</span>{r}</div>)}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Client" wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Input label="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Doe" /><Input label="Email *" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="john@email.com" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><PhoneInput label="Mobile *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /><Sel label="Session Type *" value={form.sessionType} onChange={e => setForm({ ...form, sessionType: e.target.value })} options={[{ value: "offline", label: "Offline (In-person)" }, { value: "online", label: "Online (Virtual)" }, { value: "hybrid", label: "Hybrid" }]} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Input label="Date of Birth" type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} /><Sel label="Gender" value={form.gender || ""} onChange={e => setForm({ ...form, gender: e.target.value })} options={[{ value: "", label: "— Select —" }, { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }]} /></div>
          <Input label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
          <TextArea label="Goals" value={form.goals} onChange={e => setForm({ ...form, goals: e.target.value })} placeholder="e.g. Lose 10kg in 3 months" />
          <Input label="Emergency Contact" value={form.emergencyContact} onChange={e => setForm({ ...form, emergencyContact: e.target.value })} placeholder="Name - Phone" />
          <TextArea label="Injuries / Medical Notes" value={form.injuries} onChange={e => setForm({ ...form, injuries: e.target.value })} />
          <Btn onClick={addClient} disabled={!form.name || !form.email || !form.phone} style={{ width: "100%" }}>Add Client</Btn>
        </div>
      </Modal>

      <Modal open={showBulk} onClose={() => setShowBulk(false)} title="Import Clients (CSV)" wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 12, background: C.s2, borderRadius: 10, fontSize: 12, color: C.mt, lineHeight: 1.6 }}>
            <strong style={{ color: C.tx }}>CSV Format:</strong><br />
            name, email, phone, sessionType<br />
            John Doe, john@email.com, 9876543210, offline<br />
            Jane Smith, jane@email.com, 9876543211, online
          </div>
          <div>
            <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 6, display: "block" }}>Upload CSV File</label>
            <input type="file" accept=".csv,.txt" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setCsvText(ev.target.result); r.readAsText(f); } }} style={{ fontSize: 13, color: C.tx }} />
          </div>
          <div style={{ fontSize: 13, color: C.mt, fontWeight: 500 }}>Or paste CSV data:</div>
          <TextArea value={csvText} onChange={e => setCsvText(e.target.value)} placeholder={"name, email, phone, sessionType\nJohn Doe, john@email.com, 9876543210, offline"} style={{ minHeight: 120, fontFamily: "monospace", fontSize: 12 }} />
          <Btn onClick={bulkUpload} disabled={!csvText.trim()} style={{ width: "100%" }}>📤 Import {csvText.trim() ? csvText.trim().split("\n").length - 1 : 0} Clients</Btn>
        </div>
      </Modal>
    </div>
  );
}
