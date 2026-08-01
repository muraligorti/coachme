// ═══════════════════════════════════════════════════════════════════════
// WORKOUTS — plan builder (create/edit/delete/assign), a coach-scoped
// exercise library, and workout templates. The library and templates are
// now real, database-backed, and filtered by the coach's own
// specialization (CoachProfile.specializations) — a Yoga coach sees yoga
// poses, a Strength coach sees barbell work, etc. Every coach can also
// add their own custom exercises and save any plan as a reusable
// template — this used to be one hardcoded list for everyone.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap, cName } from "../lib/utils.js";
import { Card, Badge, Btn, Input, Sel, TextArea, Modal, Empty, Tabs, ST, Spin } from "../components/ui.jsx";

export default function WorkoutsPage() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState([]);
  const [clients, setClients] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showB, setShowB] = useState(false);
  const [exS, setExS] = useState("");
  const [exF, setExF] = useState("all");
  const [editPlan, setEditPlan] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", focus: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] });
  const [assignedClientIds, setAssignedClientIds] = useState(new Set());
  const [assignedDays, setAssignedDays] = useState(new Set()); // 0=Sunday...6=Saturday, empty = flexible/no fixed schedule
  const [saveError, setSaveError] = useState("");
  const [planTypeFilter, setPlanTypeFilter] = useState("all");

  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: "", muscleGroup: "", equipment: "", specialization: "" });
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateMeta, setTemplateMeta] = useState({ name: "", description: "", level: "Intermediate", specialization: "" });
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateMeta, setNewTemplateMeta] = useState({ name: "", description: "", level: "Intermediate", specialization: "" });
  const [newTemplateSections, setNewTemplateSections] = useState([{ name: "", icon: "💪", daysOfWeek: new Set(), exercises: [{ name: "", sets: 3, reps: 10 }] }]);
  const [showMapTemplate, setShowMapTemplate] = useState(false);
  const [mapTemplateTarget, setMapTemplateTarget] = useState(null);
  const [mapTemplateClientIds, setMapTemplateClientIds] = useState(new Set());
  const [mapTemplateError, setMapTemplateError] = useState("");
  const [mapTemplateSaving, setMapTemplateSaving] = useState(false);

  const loadAll = () => {
    Promise.all([
      api.get("/workouts/plans").catch(() => null),
      api.get("/clients").catch(() => ({})),
      api.get("/exercise-library/exercises").catch(() => ({ exercises: [] })),
      api.get("/exercise-library/templates").catch(() => ({ templates: [] })),
    ]).then(([w, c, exLib, tpl]) => {
      const apiPlans = w ? unwrap(w, "workouts", "plans") : [];
      const localPlans = ls.get("local_workouts", []);
      setPlans([...apiPlans, ...localPlans.filter(lp => !apiPlans.some(ap => ap.id === lp.id))]);
      setClients(unwrap(c, "clients"));
      setExercises(exLib.exercises || []);
      setTemplates(tpl.templates || []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { loadAll(); }, []);

  const addEx = () => setForm({ ...form, exercises: [...form.exercises, { name: "", sets: 3, reps: 12, rest: 60 }] });
  const rmEx = i => setForm({ ...form, exercises: form.exercises.filter((_, j) => j !== i) });
  const upEx = (i, f, v) => { const e = [...form.exercises]; e[i] = { ...e[i], [f]: v }; setForm({ ...form, exercises: e }); };

  const save = async () => {
    setSaveError("");
    const payload = { name: form.title, description: form.description, focus: form.focus || null, exercises: form.exercises.filter(e => e.name), intensity: "moderate", durationWeeks: 4 };
    const clientIds = [...assignedClientIds];
    let planId = editPlan?.id;
    if (editPlan) {
      try {
        if (String(editPlan.id).startsWith("workout_")) {
          const local = ls.get("local_workouts", []).map(p => p.id === editPlan.id ? { ...p, ...form, exercises: form.exercises.filter(e => e.name) } : p);
          ls.set("local_workouts", local); setPlans(prev => prev.map(p => p.id === editPlan.id ? { ...p, ...form, exercises: form.exercises.filter(e => e.name) } : p));
        } else {
          const updated = await api.put(`/workouts/plans/${editPlan.id}`, payload);
          setPlans(prev => prev.map(p => p.id === editPlan.id ? { ...p, ...(updated || form), exercises: (updated?.exercises) || form.exercises.filter(e => e.name) } : p));
        }
      } catch (e) {
        setSaveError("Could not save changes: " + e.message);
        return;
      }
    } else {
      try {
        const created = await api.post("/workouts/plans", payload);
        planId = created?.id;
        setPlans(prev => [...prev, created || { ...payload, id: `pending_${Date.now()}`, status: "active", createdAt: new Date().toISOString() }]);
      } catch (e) {
        setSaveError((clientIds.length ? "Could not save this plan: " : "Could not save plan: ") + e.message);
        return; // do NOT fall back to a local-only plan — a client-assigned plan that silently fails must never look like success
      }
    }
    // Assignment is a separate, verified step — deliberately not folded
    // into the plan create/update payload itself, since that field was
    // the source of the earlier "client not getting stored" bug.
    if (planId && !String(planId).startsWith("pending_") && !String(planId).startsWith("workout_")) {
      try { await api.put(`/workout-assignments/plan/${planId}`, { clientIds, daysOfWeek: [...assignedDays] }); }
      catch (e) { setSaveError(`Plan saved, but assigning to client(s) failed: ${e.message}`); return; }
    }
    setEditPlan(null); setShowB(false); setAssignedClientIds(new Set()); setAssignedDays(new Set()); setForm({ title: "", description: "", focus: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] });
  };

  const deletePlan = async (p) => {
    if (!confirm("Delete this workout plan?")) return;
    if (String(p.id).startsWith("workout_")) { const local = ls.get("local_workouts", []).filter(x => x.id !== p.id); ls.set("local_workouts", local); }
    else { try { await api.del(`/workouts/plans/${p.id}`); } catch { const local = ls.get("local_workouts", []).filter(x => x.id !== p.id); ls.set("local_workouts", local); } }
    setPlans(prev => prev.filter(x => x.id !== p.id));
  };

  const startEdit = (p) => {
    setSaveError("");
    setEditPlan(p);
    setForm({ title: p.title || p.name || "", description: p.description || "", focus: p.focus || "", exercises: (p.exercises && p.exercises.length > 0) ? p.exercises.map(e => ({ name: e.name || e, sets: e.sets || 3, reps: e.reps || 12, rest: e.rest || 60 })) : [{ name: "", sets: 3, reps: 12, rest: 60 }] });
    setAssignedClientIds(new Set()); setAssignedDays(new Set());
    if (!String(p.id).startsWith("workout_") && !String(p.id).startsWith("pending_")) {
      api.get(`/workout-assignments/plan/${p.id}`).then(r => { setAssignedClientIds(new Set(r.clientIds || [])); setAssignedDays(new Set(r.daysOfWeek || [])); }).catch(() => {});
    }
    setShowB(true);
  };

  // Using a multi-section template no longer means "pre-fill one plan's
  // form" — a template can have several sections, each becoming its own
  // real plan. This opens the map-to-client(s) flow instead.
  const openMapTemplate = (t) => {
    setMapTemplateTarget(t); setMapTemplateClientIds(new Set()); setMapTemplateError("");
    setShowMapTemplate(true);
  };

  const confirmMapTemplate = async () => {
    if (mapTemplateClientIds.size === 0) { setMapTemplateError("Select at least one client"); return; }
    setMapTemplateSaving(true); setMapTemplateError("");
    try {
      await api.post(`/workout-assignments/map-template/${mapTemplateTarget.id}`, { clientIds: [...mapTemplateClientIds] });
      setShowMapTemplate(false); setMapTemplateTarget(null);
      loadAll();
    } catch (e) { setMapTemplateError(e.message); }
    setMapTemplateSaving(false);
  };

  // ── Multi-day template builder (from scratch, not derived from a plan-in-progress) ──
  const addSection = () => setNewTemplateSections([...newTemplateSections, { name: "", icon: "💪", daysOfWeek: new Set(), exercises: [{ name: "", sets: 3, reps: 10 }] }]);
  const removeSection = (i) => setNewTemplateSections(newTemplateSections.filter((_, j) => j !== i));
  const updateSection = (i, field, value) => setNewTemplateSections(newTemplateSections.map((s, j) => j === i ? { ...s, [field]: value } : s));
  const toggleSectionDay = (i, dow) => setNewTemplateSections(newTemplateSections.map((s, j) => {
    if (j !== i) return s;
    const next = new Set(s.daysOfWeek); next.has(dow) ? next.delete(dow) : next.add(dow);
    return { ...s, daysOfWeek: next };
  }));
  const addSectionExercise = (i) => setNewTemplateSections(newTemplateSections.map((s, j) => j === i ? { ...s, exercises: [...s.exercises, { name: "", sets: 3, reps: 10 }] } : s));
  const removeSectionExercise = (i, exI) => setNewTemplateSections(newTemplateSections.map((s, j) => j === i ? { ...s, exercises: s.exercises.filter((_, k) => k !== exI) } : s));
  const updateSectionExercise = (i, exI, field, value) => setNewTemplateSections(newTemplateSections.map((s, j) => j === i ? { ...s, exercises: s.exercises.map((e, k) => k === exI ? { ...e, [field]: value } : e) } : s));

  const saveNewTemplate = async () => {
    if (!newTemplateMeta.name.trim()) { setSaveError("Template name is required"); return; }
    const sections = newTemplateSections.filter(s => s.name.trim() && s.exercises.some(e => e.name.trim()));
    if (sections.length === 0) { setSaveError("Add at least one section with a name and at least one exercise"); return; }
    try {
      await api.post("/exercise-library/templates", {
        ...newTemplateMeta,
        sections: sections.map(s => ({ name: s.name.trim(), icon: s.icon, daysOfWeek: [...s.daysOfWeek], exercises: s.exercises.filter(e => e.name.trim()) })),
      });
      setShowNewTemplate(false);
      setNewTemplateMeta({ name: "", description: "", level: "Intermediate", specialization: "" });
      setNewTemplateSections([{ name: "", icon: "💪", daysOfWeek: new Set(), exercises: [{ name: "", sets: 3, reps: 10 }] }]);
      loadAll();
    } catch (e) { alert("Could not save template: " + e.message); }
  };

  const addCustomExercise = async () => {
    if (!newEx.name.trim()) return;
    try {
      await api.post("/exercise-library/exercises", newEx);
      setNewEx({ name: "", muscleGroup: "", equipment: "", specialization: "" });
      setShowAddEx(false);
      loadAll();
    } catch (e) { alert("Could not add exercise: " + e.message); }
  };

  const removeCustomExercise = async (id) => {
    if (!confirm("Remove this exercise from your library?")) return;
    try { await api.del(`/exercise-library/exercises/${id}`); loadAll(); } catch (e) { alert(e.message); }
  };

  const saveAsTemplate = async () => {
    if (!templateMeta.name.trim()) return;
    try {
      const section = { name: templateMeta.name.trim(), icon: "💪", daysOfWeek: [], exercises: form.exercises.filter(e => e.name) };
      await api.post("/exercise-library/templates", { ...templateMeta, sections: [section] });
      setShowSaveTemplate(false);
      setTemplateMeta({ name: "", description: "", level: "Intermediate", specialization: "" });
      loadAll();
    } catch (e) { alert("Could not save template: " + e.message); }
  };

  const removeTemplate = async (id) => {
    if (!confirm("Remove this template?")) return;
    try { await api.del(`/exercise-library/templates/${id}`); loadAll(); } catch (e) { alert(e.message); }
  };

  const fe = exercises.filter(e => { if (exS && !e.name.toLowerCase().includes(exS.toLowerCase())) return false; if (exF !== "all" && e.muscleGroup !== exF) return false; return true; });
  const muscleGroups = [...new Set(exercises.map(e => e.muscleGroup).filter(Boolean))];

  if (loading) return <Spin />;

  return (
    <div>
      <ST right={<Btn onClick={() => { setEditPlan(null); setSaveError(""); setAssignedClientIds(new Set()); setAssignedDays(new Set()); setForm({ title: "", description: "", focus: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] }); setShowB(true); }} style={{ padding: "8px 16px", fontSize: 13 }}>+ Create</Btn>}>Workouts</ST>
      <Tabs tabs={[{ id: "plans", label: "My Plans" }, { id: "library", label: "Exercise Library" }, { id: "templates", label: "Templates" }]} active={tab} onChange={setTab} />

      {tab === "plans" && (plans.length === 0 ? <Empty icon="💪" text="No workout plans yet" /> : (
        <div>
          {plans.some(p => p.focus) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {[{ v: "all", l: "All" }, { v: "upper_body", l: "💪 Upper" }, { v: "lower_body", l: "🦵 Lower" }, { v: "full_body", l: "🔄 Composite" }, { v: "cardio", l: "🫁 Cardio" }].map(t => (
                <button key={t.v} onClick={() => setPlanTypeFilter(t.v)} style={{ padding: "5px 11px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: planTypeFilter === t.v ? C.ac : C.s2, color: planTypeFilter === t.v ? "#fff" : C.mt }}>{t.l}</button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {plans.filter(p => planTypeFilter === "all" || p.focus === planTypeFilter).map(p => (
              <Card key={p.id} style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ color: C.tx, fontWeight: 600, fontSize: 15 }}>{p.title || p.name}</div>
                    {p.description && <div style={{ color: C.mt, fontSize: 12, marginTop: 4 }}>{p.description}</div>}
                    {p.focus && <span style={{ display: "inline-block", marginTop: 6, fontSize: 9.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: C.ac + "20", color: C.ac }}>{({ upper_body: "💪 Upper", lower_body: "🦵 Lower", full_body: "🔄 Composite", cardio: "🫁 Cardio" })[p.focus] || p.focus}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Badge color={p.status === "active" ? C.ok : C.mt}>{p.status || "draft"}</Badge>
                    <button onClick={() => startEdit(p)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: C.wn + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>✏️</button>
                    <button onClick={() => deletePlan(p)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: C.dg + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🗑️</button>
                  </div>
                </div>
                {p.exercises && Array.isArray(p.exercises) && <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 4 }}>{p.exercises.slice(0, 4).map((ex, i) => <span key={i} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500, background: C.ac + "15", color: C.ac }}>{ex.name || ex}</span>)}</div>}
              </Card>
            ))}
          </div>
        </div>
      ))}

      {tab === "library" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
            <Input placeholder="Search exercises…" value={exS} onChange={e => setExS(e.target.value)} style={{ flex: 1 }} />
            <Btn onClick={() => setShowAddEx(true)} style={{ padding: "10px 14px", fontSize: 12, whiteSpace: "nowrap" }}>+ Add</Btn>
          </div>
          {muscleGroups.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={() => setExF("all")} style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: exF === "all" ? C.ac : C.s2, color: exF === "all" ? "#fff" : C.mt }}>All</button>
            {muscleGroups.map(m => <button key={m} onClick={() => setExF(m)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: exF === m ? C.ac : C.s2, color: exF === m ? "#fff" : C.mt }}>{m}</button>)}
          </div>}
          {fe.length === 0 ? <Empty icon="🏋️" text="No exercises match — try a different search, or add your own." /> : fe.map((e) => (
            <Card key={e.id} style={{ padding: 12, marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.ac + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏋️</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{e.name}{e.coachId && <span style={{ fontSize: 9, fontWeight: 700, background: C.ac + "20", color: C.ac, padding: "2px 6px", borderRadius: 20, marginLeft: 6 }}>Mine</span>}</div>
                <div style={{ fontSize: 11, color: C.mt }}>{e.muscleGroup || "—"} · {e.equipment || "—"}</div>
              </div>
              {e.coachId && <button onClick={() => removeCustomExercise(e.id)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", cursor: "pointer", background: C.dg + "15", color: C.dg, fontSize: 12 }}>🗑️</button>}
            </Card>
          ))}
        </div>
      )}

      {tab === "templates" && (
        <div>
          <Btn onClick={() => setShowNewTemplate(true)} style={{ marginBottom: 14, padding: "8px 16px", fontSize: 12 }}>+ New Multi-Day Template</Btn>
          {templates.length === 0 ? <Empty icon="📋" text="No templates yet" /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {templates.map((t) => {
              const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
              return (
                <Card key={t.id} style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{t.name}{t.coachId && <span style={{ fontSize: 9, fontWeight: 700, background: C.ac + "20", color: C.ac, padding: "2px 6px", borderRadius: 20, marginLeft: 6 }}>Mine</span>}</div>
                      <div style={{ fontSize: 12, color: C.mt }}>{(t.sections || []).length} section{(t.sections || []).length !== 1 ? "s" : ""}{t.level ? ` · ${t.level}` : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn onClick={() => openMapTemplate(t)} style={{ padding: "6px 12px", fontSize: 12 }}>Map to Client(s)</Btn>
                      {t.coachId && <button onClick={() => removeTemplate(t.id)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: C.dg + "15", color: C.dg, fontSize: 12 }}>🗑️</button>}
                    </div>
                  </div>
                  {(t.sections || []).length > 0 && (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                      {t.sections.map((s, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, padding: "5px 8px", background: C.s2, borderRadius: 8 }}>
                          <span style={{ color: C.tx, fontWeight: 500 }}>{s.icon} {s.name}</span>
                          <span style={{ color: C.mt }}>{s.daysOfWeek && s.daysOfWeek.length > 0 ? s.daysOfWeek.slice().sort().map(d => dayNames[d]).join(", ") : "flexible"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          )}
        </div>
      )}

      <Modal open={showB} onClose={() => { setShowB(false); setEditPlan(null); }} title={editPlan ? "Edit Workout" : "Create Workout"} wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. PPL Week 1" />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          <div>
            <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 6, display: "block" }}>Workout Type <span style={{ opacity: .6 }}>(optional)</span></label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[{ v: "upper_body", l: "💪 Upper Body" }, { v: "lower_body", l: "🦵 Lower Body" }, { v: "full_body", l: "🔄 Full Body / Composite" }, { v: "cardio", l: "🫁 Cardio" }].map(t => (
                <button key={t.v} type="button" onClick={() => setForm({ ...form, focus: form.focus === t.v ? "" : t.v })} style={{ padding: "7px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11.5, fontWeight: 600, background: form.focus === t.v ? C.ac : C.s2, color: form.focus === t.v ? "#fff" : C.mt }}>{t.l}</button>
              ))}
            </div>
            <Input value={["upper_body", "lower_body", "full_body", "cardio", ""].includes(form.focus) ? "" : form.focus} onChange={e => setForm({ ...form, focus: e.target.value })} placeholder="Or type a custom label…" style={{ marginTop: 6 }} />
          </div>
          {clients.length > 0 && (
            <div>
              <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>Assign to (select any number)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", border: `1px solid ${C.bd}`, borderRadius: 10, padding: 8 }}>
                {clients.map(c => {
                  const checked = assignedClientIds.has(c.id);
                  return (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: checked ? C.ac + "12" : "transparent" }}
                      onClick={() => setAssignedClientIds(prev => { const next = new Set(prev); next.has(c.id) ? next.delete(c.id) : next.add(c.id); return next; })}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? C.ac : C.bd}`, background: checked ? C.ac : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", flexShrink: 0 }}>{checked ? "✓" : ""}</div>
                      <span style={{ fontSize: 13, color: C.tx }}>{cName(c)}</span>
                    </label>
                  );
                })}
              </div>
              {assignedClientIds.size > 0 && <div style={{ fontSize: 11, color: C.mt, marginTop: 4 }}>{assignedClientIds.size} client{assignedClientIds.size !== 1 ? "s" : ""} selected</div>}
              {assignedClientIds.size > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 6, display: "block" }}>Recurs on <span style={{ opacity: .6 }}>(optional — leave blank for a one-off plan)</span></label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, dow) => {
                      const checked = assignedDays.has(dow);
                      return (
                        <button key={dow} type="button" onClick={() => setAssignedDays(prev => { const next = new Set(prev); next.has(dow) ? next.delete(dow) : next.add(dow); return next; })}
                          style={{ width: 38, height: 38, borderRadius: 12, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: checked ? C.ac : C.s2, color: checked ? "#000" : C.mt }}>{label}</button>
                      );
                    })}
                  </div>
                  {assignedDays.size > 0 && <div style={{ fontSize: 10.5, color: C.mt, marginTop: 6 }}>Applies to every client selected above.</div>}
                </div>
              )}
            </div>
          )}
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginTop: 8 }}>Exercises</div>
          {form.exercises.map((ex, i) => (
            <Card key={i} style={{ padding: 12, background: C.s2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 12, color: C.mt, fontWeight: 600 }}>#{i + 1}</span>{form.exercises.length > 1 && <button onClick={() => rmEx(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dg, fontSize: 18 }}>✕</button>}</div>
              <Sel value={ex.name} onChange={e => upEx(i, "name", e.target.value)} options={[{ value: "", label: "— Pick —" }, ...exercises.map(e => ({ value: e.name, label: `${e.name}${e.muscleGroup ? ` (${e.muscleGroup})` : ""}` }))]} style={{ marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}><Input label="Sets" type="number" value={ex.sets} onChange={e => upEx(i, "sets", +e.target.value)} /><Input label="Reps" type="number" value={ex.reps} onChange={e => upEx(i, "reps", +e.target.value)} /><Input label="Rest(s)" type="number" value={ex.rest} onChange={e => upEx(i, "rest", +e.target.value)} /></div>
            </Card>
          ))}
          <Btn variant="secondary" onClick={addEx} style={{ width: "100%" }}>+ Exercise</Btn>
          {saveError && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{saveError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" onClick={() => setShowSaveTemplate(true)} disabled={form.exercises.filter(e => e.name).length === 0} style={{ flex: 1 }}>💾 Save as Template</Btn>
            <Btn onClick={save} style={{ flex: 2 }}>{editPlan ? "Update Plan" : "Save Plan"}</Btn>
          </div>
        </div>
      </Modal>

      <Modal open={showAddEx} onClose={() => setShowAddEx(false)} title="Add Exercise to Your Library">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" value={newEx.name} onChange={e => setNewEx({ ...newEx, name: e.target.value })} placeholder="e.g. Cable Crossover" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Muscle Group" value={newEx.muscleGroup} onChange={e => setNewEx({ ...newEx, muscleGroup: e.target.value })} placeholder="e.g. Chest" />
            <Input label="Equipment" value={newEx.equipment} onChange={e => setNewEx({ ...newEx, equipment: e.target.value })} placeholder="e.g. Cable" />
          </div>
          <Input label="Specialization tag (optional)" value={newEx.specialization} onChange={e => setNewEx({ ...newEx, specialization: e.target.value })} placeholder="e.g. yoga, crossfit — leave blank for general" />
          <Btn onClick={addCustomExercise} style={{ width: "100%" }}>Add to My Library</Btn>
        </div>
      </Modal>

      <Modal open={showSaveTemplate} onClose={() => setShowSaveTemplate(false)} title="Save as Template">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 12, color: C.mt }}>Saves the {form.exercises.filter(e => e.name).length} exercise(s) above as a reusable template — not tied to any specific client.</div>
          <Input label="Template Name" value={templateMeta.name} onChange={e => setTemplateMeta({ ...templateMeta, name: e.target.value })} placeholder="e.g. My Push Day" />
          <TextArea label="Description" value={templateMeta.description} onChange={e => setTemplateMeta({ ...templateMeta, description: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Sel label="Level" value={templateMeta.level} onChange={e => setTemplateMeta({ ...templateMeta, level: e.target.value })} options={[{ value: "Beginner", label: "Beginner" }, { value: "Intermediate", label: "Intermediate" }, { value: "Advanced", label: "Advanced" }]} />
            <Input label="Specialization (optional)" value={templateMeta.specialization} onChange={e => setTemplateMeta({ ...templateMeta, specialization: e.target.value })} placeholder="e.g. yoga" />
          </div>
          <Btn onClick={saveAsTemplate} style={{ width: "100%" }}>Save Template</Btn>
        </div>
      </Modal>

      <Modal open={showNewTemplate} onClose={() => setShowNewTemplate(false)} title="New Multi-Day Template" wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Template Name" value={newTemplateMeta.name} onChange={e => setNewTemplateMeta({ ...newTemplateMeta, name: e.target.value })} placeholder="e.g. Beginner" />
          <TextArea label="Description" value={newTemplateMeta.description} onChange={e => setNewTemplateMeta({ ...newTemplateMeta, description: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Sel label="Level" value={newTemplateMeta.level} onChange={e => setNewTemplateMeta({ ...newTemplateMeta, level: e.target.value })} options={[{ value: "Beginner", label: "Beginner" }, { value: "Intermediate", label: "Intermediate" }, { value: "Advanced", label: "Advanced" }]} />
            <Input label="Specialization (optional)" value={newTemplateMeta.specialization} onChange={e => setNewTemplateMeta({ ...newTemplateMeta, specialization: e.target.value })} placeholder="e.g. yoga" />
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginTop: 6 }}>Sections <span style={{ fontSize: 11, color: C.mt, fontWeight: 400 }}>(add as many as this program needs)</span></div>
          {newTemplateSections.map((s, i) => (
            <Card key={i} style={{ padding: 12, background: C.s2, borderLeft: `3px solid ${C.ac}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Input value={s.name} onChange={e => updateSection(i, "name", e.target.value)} placeholder="e.g. Upper Body" style={{ flex: 1, marginRight: 8 }} />
                {newTemplateSections.length > 1 && <button onClick={() => removeSection(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dg, fontSize: 18 }}>✕</button>}
              </div>
              <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
                {["S", "M", "T", "W", "T", "F", "S"].map((label, dow) => {
                  const checked = s.daysOfWeek.has(dow);
                  return <button key={dow} type="button" onClick={() => toggleSectionDay(i, dow)} style={{ width: 32, height: 32, borderRadius: 9, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 700, background: checked ? C.ac : C.sf, color: checked ? "#fff" : C.mt }}>{label}</button>;
                })}
              </div>
              {s.exercises.map((ex, exI) => (
                <div key={exI} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
                  <Sel value={ex.name} onChange={e => updateSectionExercise(i, exI, "name", e.target.value)} options={[{ value: "", label: "— Pick —" }, ...exercises.map(e => ({ value: e.name, label: e.name }))]} style={{ flex: 2 }} />
                  <Input type="number" value={ex.sets} onChange={e => updateSectionExercise(i, exI, "sets", +e.target.value)} placeholder="Sets" style={{ flex: 1 }} />
                  <Input type="number" value={ex.reps} onChange={e => updateSectionExercise(i, exI, "reps", +e.target.value)} placeholder="Reps" style={{ flex: 1 }} />
                  {s.exercises.length > 1 && <button onClick={() => removeSectionExercise(i, exI)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dg, fontSize: 16, flexShrink: 0 }}>✕</button>}
                </div>
              ))}
              <button onClick={() => addSectionExercise(i)} style={{ fontSize: 11, color: C.ac, background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>+ Add exercise</button>
            </Card>
          ))}
          <Btn variant="secondary" onClick={addSection} style={{ width: "100%" }}>+ Add Section</Btn>
          {saveError && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{saveError}</div>}
          <Btn onClick={saveNewTemplate} style={{ width: "100%" }}>Save Template</Btn>
        </div>
      </Modal>

      <Modal open={showMapTemplate} onClose={() => setShowMapTemplate(false)} title={`Map "${mapTemplateTarget?.name || ""}" to Client(s)`} wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: C.mt }}>Uses the template's default days as a starting point — you can adjust any resulting plan's days per client afterward, same as editing any other plan's assignment.</div>
          {mapTemplateTarget?.sections?.length > 0 && (
            <Card style={{ padding: 12 }}>
              <div style={{ fontSize: 11, color: C.mt, marginBottom: 8 }}>This will create, for each selected client:</div>
              {mapTemplateTarget.sections.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "6px 0", borderBottom: i < mapTemplateTarget.sections.length - 1 ? `1px solid ${C.bd}` : "none" }}>
                  <span style={{ color: C.tx }}>{s.icon} {s.name}</span>
                  <span style={{ color: C.ac, fontWeight: 600 }}>{s.daysOfWeek && s.daysOfWeek.length > 0 ? s.daysOfWeek.slice().sort().map(d => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ") : "flexible"}</span>
                </div>
              ))}
            </Card>
          )}
          <div>
            <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>Assign to</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", border: `1px solid ${C.bd}`, borderRadius: 10, padding: 8 }}>
              {clients.map(c => {
                const checked = mapTemplateClientIds.has(c.id);
                return (
                  <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: checked ? C.ac + "12" : "transparent" }}
                    onClick={() => setMapTemplateClientIds(prev => { const next = new Set(prev); next.has(c.id) ? next.delete(c.id) : next.add(c.id); return next; })}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? C.ac : C.bd}`, background: checked ? C.ac : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", flexShrink: 0 }}>{checked ? "✓" : ""}</div>
                    <span style={{ fontSize: 13, color: C.tx }}>{cName(c)}</span>
                  </label>
                );
              })}
            </div>
          </div>
          {mapTemplateError && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{mapTemplateError}</div>}
          <Btn onClick={confirmMapTemplate} disabled={mapTemplateSaving} style={{ width: "100%" }}>{mapTemplateSaving ? "Mapping…" : "Confirm Mapping"}</Btn>
        </div>
      </Modal>
    </div>
  );
}
