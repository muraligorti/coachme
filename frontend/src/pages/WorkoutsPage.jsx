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
  const [form, setForm] = useState({ title: "", description: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] });
  const [assignedClientIds, setAssignedClientIds] = useState(new Set());
  const [saveError, setSaveError] = useState("");

  const [showAddEx, setShowAddEx] = useState(false);
  const [newEx, setNewEx] = useState({ name: "", muscleGroup: "", equipment: "", specialization: "" });
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateMeta, setTemplateMeta] = useState({ name: "", description: "", level: "Intermediate", specialization: "" });

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
    const payload = { name: form.title, description: form.description, exercises: form.exercises.filter(e => e.name), intensity: "moderate", durationWeeks: 4 };
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
      try { await api.put(`/workout-assignments/plan/${planId}`, { clientIds }); }
      catch (e) { setSaveError(`Plan saved, but assigning to client(s) failed: ${e.message}`); return; }
    }
    setEditPlan(null); setShowB(false); setAssignedClientIds(new Set()); setForm({ title: "", description: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] });
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
    setForm({ title: p.title || p.name || "", description: p.description || "", exercises: (p.exercises && p.exercises.length > 0) ? p.exercises.map(e => ({ name: e.name || e, sets: e.sets || 3, reps: e.reps || 12, rest: e.rest || 60 })) : [{ name: "", sets: 3, reps: 12, rest: 60 }] });
    setAssignedClientIds(new Set());
    if (!String(p.id).startsWith("workout_") && !String(p.id).startsWith("pending_")) {
      api.get(`/workout-assignments/plan/${p.id}`).then(r => setAssignedClientIds(new Set(r.clientIds || []))).catch(() => {});
    }
    setShowB(true);
  };

  // Use a template: pre-fill the create form with its exercises so the
  // coach can immediately assign it to a client and tweak anything —
  // this button previously did nothing at all.
  const useTemplate = (t) => {
    setEditPlan(null); setSaveError("");
    setForm({ title: t.name, description: t.description || "", exercises: (t.exercises || []).map(e => ({ name: e.name, sets: e.sets || 3, reps: e.reps || 12, rest: e.rest || 60 })) });
    setAssignedClientIds(new Set());
    setShowB(true);
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
      await api.post("/exercise-library/templates", { ...templateMeta, exercises: form.exercises.filter(e => e.name) });
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
      <ST right={<Btn onClick={() => { setEditPlan(null); setSaveError(""); setAssignedClientIds(new Set()); setForm({ title: "", description: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] }); setShowB(true); }} style={{ padding: "8px 16px", fontSize: 13 }}>+ Create</Btn>}>Workouts</ST>
      <Tabs tabs={[{ id: "plans", label: "My Plans" }, { id: "library", label: "Exercise Library" }, { id: "templates", label: "Templates" }]} active={tab} onChange={setTab} />

      {tab === "plans" && (plans.length === 0 ? <Empty icon="💪" text="No workout plans yet" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {plans.map(p => (
            <Card key={p.id} style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div><div style={{ color: C.tx, fontWeight: 600, fontSize: 15 }}>{p.title || p.name}</div>{p.description && <div style={{ color: C.mt, fontSize: 12, marginTop: 4 }}>{p.description}</div>}</div>
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
        templates.length === 0 ? <Empty icon="📋" text="No templates yet" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {templates.map((t) => (
            <Card key={t.id} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{t.name}{t.coachId && <span style={{ fontSize: 9, fontWeight: 700, background: C.ac + "20", color: C.ac, padding: "2px 6px", borderRadius: 20, marginLeft: 6 }}>Mine</span>}</div>
                <div style={{ fontSize: 12, color: C.mt }}>{(t.exercises || []).length} exercises{t.level ? ` · ${t.level}` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn variant="secondary" onClick={() => useTemplate(t)} style={{ padding: "6px 12px", fontSize: 12 }}>Use</Btn>
                {t.coachId && <button onClick={() => removeTemplate(t.id)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", background: C.dg + "15", color: C.dg, fontSize: 12 }}>🗑️</button>}
              </div>
            </Card>
          ))}
        </div>
        )
      )}

      <Modal open={showB} onClose={() => { setShowB(false); setEditPlan(null); }} title={editPlan ? "Edit Workout" : "Create Workout"} wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. PPL Week 1" />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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
    </div>
  );
}
