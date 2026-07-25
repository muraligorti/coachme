// ═══════════════════════════════════════════════════════════════════════
// WORKOUTS — plan builder (create/edit/delete/assign), an exercise
// library with search/filter, and starter templates.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap, cName } from "../lib/utils.js";
import { Card, Badge, Btn, Input, Sel, Modal, Empty, Tabs, ST, Spin } from "../components/ui.jsx";

export const EXDB = [
  { name: "Barbell Squat", muscle: "Legs", eq: "Barbell" }, { name: "Bench Press", muscle: "Chest", eq: "Barbell" }, { name: "Deadlift", muscle: "Back", eq: "Barbell" },
  { name: "Overhead Press", muscle: "Shoulders", eq: "Barbell" }, { name: "Barbell Row", muscle: "Back", eq: "Barbell" }, { name: "Pull-ups", muscle: "Back", eq: "Bodyweight" },
  { name: "Dumbbell Curl", muscle: "Biceps", eq: "Dumbbell" }, { name: "Tricep Pushdown", muscle: "Triceps", eq: "Cable" }, { name: "Leg Press", muscle: "Legs", eq: "Machine" },
  { name: "Lat Pulldown", muscle: "Back", eq: "Cable" }, { name: "Dumbbell Fly", muscle: "Chest", eq: "Dumbbell" }, { name: "Lateral Raise", muscle: "Shoulders", eq: "Dumbbell" },
  { name: "Romanian Deadlift", muscle: "Hamstrings", eq: "Barbell" }, { name: "Leg Curl", muscle: "Hamstrings", eq: "Machine" }, { name: "Calf Raise", muscle: "Calves", eq: "Machine" },
  { name: "Plank", muscle: "Core", eq: "Bodyweight" }, { name: "Face Pull", muscle: "Shoulders", eq: "Cable" }, { name: "Hip Thrust", muscle: "Glutes", eq: "Barbell" },
  { name: "Incline DB Press", muscle: "Chest", eq: "Dumbbell" }, { name: "Bulgarian Split Squat", muscle: "Legs", eq: "Dumbbell" }, { name: "Hammer Curl", muscle: "Biceps", eq: "Dumbbell" },
  { name: "Skull Crusher", muscle: "Triceps", eq: "Barbell" }, { name: "Cable Fly", muscle: "Chest", eq: "Cable" },
];

export default function WorkoutsPage() {
  const [tab, setTab] = useState("plans");
  const [plans, setPlans] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showB, setShowB] = useState(false);
  const [exS, setExS] = useState("");
  const [exF, setExF] = useState("all");
  const [editPlan, setEditPlan] = useState(null);
  const [form, setForm] = useState({ title: "", description: "", clientId: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] });

  useEffect(() => {
    Promise.all([api.get("/workouts/plans").catch(() => null), api.get("/clients").catch(() => ({}))]).then(([w, c]) => {
      const apiPlans = w ? unwrap(w, "workouts", "plans") : [];
      const localPlans = ls.get("local_workouts", []);
      setPlans([...apiPlans, ...localPlans.filter(lp => !apiPlans.some(ap => ap.id === lp.id))]);
      setClients(unwrap(c, "clients"));
    }).finally(() => setLoading(false));
  }, []);

  const addEx = () => setForm({ ...form, exercises: [...form.exercises, { name: "", sets: 3, reps: 12, rest: 60 }] });
  const rmEx = i => setForm({ ...form, exercises: form.exercises.filter((_, j) => j !== i) });
  const upEx = (i, f, v) => { const e = [...form.exercises]; e[i] = { ...e[i], [f]: v }; setForm({ ...form, exercises: e }); };

  const save = async () => {
    const payload = { name: form.title, description: form.description, exercises: form.exercises.filter(e => e.name), intensity: "moderate", durationWeeks: 4 };
    if (editPlan) {
      try {
        if (String(editPlan.id).startsWith("workout_")) {
          const local = ls.get("local_workouts", []).map(p => p.id === editPlan.id ? { ...p, ...form, exercises: form.exercises.filter(e => e.name) } : p);
          ls.set("local_workouts", local); setPlans(prev => prev.map(p => p.id === editPlan.id ? { ...p, ...form, exercises: form.exercises.filter(e => e.name) } : p));
        } else {
          await api.put(`/workouts/plans/${editPlan.id}`, payload);
          setPlans(prev => prev.map(p => p.id === editPlan.id ? { ...p, ...form, exercises: form.exercises.filter(e => e.name) } : p));
        }
      } catch {
        const local = ls.get("local_workouts", []).map(p => p.id === editPlan.id ? { ...p, ...form, exercises: form.exercises.filter(e => e.name) } : p);
        ls.set("local_workouts", local); setPlans(prev => prev.map(p => p.id === editPlan.id ? { ...p, ...form, exercises: form.exercises.filter(e => e.name) } : p));
      }
    } else {
      try { await api.post("/workouts/plans", payload); }
      catch {
        const plan = { ...form, id: `workout_${Date.now()}`, status: "active", createdAt: new Date().toISOString(), exercises: form.exercises.filter(e => e.name) };
        const local = ls.get("local_workouts", []); local.push(plan); ls.set("local_workouts", local);
        setPlans(prev => [...prev, plan]);
      }
    }
    setEditPlan(null); setShowB(false); setForm({ title: "", description: "", clientId: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] });
  };

  const deletePlan = async (p) => {
    if (!confirm("Delete this workout plan?")) return;
    if (String(p.id).startsWith("workout_")) { const local = ls.get("local_workouts", []).filter(x => x.id !== p.id); ls.set("local_workouts", local); }
    else { try { await api.del(`/workouts/plans/${p.id}`); } catch { const local = ls.get("local_workouts", []).filter(x => x.id !== p.id); ls.set("local_workouts", local); } }
    setPlans(prev => prev.filter(x => x.id !== p.id));
  };

  const startEdit = (p) => {
    setEditPlan(p);
    setForm({ title: p.title || p.name || "", description: p.description || "", clientId: p.clientId || "", exercises: (p.exercises && p.exercises.length > 0) ? p.exercises.map(e => ({ name: e.name || e, sets: e.sets || 3, reps: e.reps || 12, rest: e.rest || 60 })) : [{ name: "", sets: 3, reps: 12, rest: 60 }] });
    setShowB(true);
  };

  const fe = EXDB.filter(e => { if (exS && !e.name.toLowerCase().includes(exS.toLowerCase())) return false; if (exF !== "all" && e.muscle !== exF) return false; return true; });
  const muscles = [...new Set(EXDB.map(e => e.muscle))];

  if (loading) return <Spin />;

  return (
    <div>
      <ST right={<Btn onClick={() => { setEditPlan(null); setForm({ title: "", description: "", clientId: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60 }] }); setShowB(true); }} style={{ padding: "8px 16px", fontSize: 13 }}>+ Create</Btn>}>Workouts</ST>
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
          <Input placeholder="Search exercises…" value={exS} onChange={e => setExS(e.target.value)} style={{ marginBottom: 10 }} />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
            <button onClick={() => setExF("all")} style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: exF === "all" ? C.ac : C.s2, color: exF === "all" ? "#fff" : C.mt }}>All</button>
            {muscles.map(m => <button key={m} onClick={() => setExF(m)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: exF === m ? C.ac : C.s2, color: exF === m ? "#fff" : C.mt }}>{m}</button>)}
          </div>
          {fe.map((e, i) => (
            <Card key={i} style={{ padding: 12, marginBottom: 6, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.ac + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏋️</div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{e.name}</div><div style={{ fontSize: 11, color: C.mt }}>{e.muscle} · {e.eq}</div></div>
            </Card>
          ))}
        </div>
      )}

      {tab === "templates" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[{ n: "PPL - Push", ex: 6, lv: "Intermediate" }, { n: "PPL - Pull", ex: 6, lv: "Intermediate" }, { n: "PPL - Legs", ex: 6, lv: "Intermediate" }, { n: "Full Body Beginner", ex: 8, lv: "Beginner" }, { n: "Upper/Lower A", ex: 6, lv: "Advanced" }].map((t, i) => (
            <Card key={i} style={{ padding: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{t.n}</div><div style={{ fontSize: 12, color: C.mt }}>{t.ex} exercises · {t.lv}</div></div>
              <Btn variant="secondary" style={{ padding: "6px 12px", fontSize: 12 }}>Use</Btn>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showB} onClose={() => { setShowB(false); setEditPlan(null); }} title={editPlan ? "Edit Workout" : "Create Workout"} wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. PPL Week 1" />
          <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          {clients.length > 0 && <Sel label="Assign" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} options={[{ value: "", label: "— Select —" }, ...clients.map(c => ({ value: c.id, label: cName(c) }))]} />}
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginTop: 8 }}>Exercises</div>
          {form.exercises.map((ex, i) => (
            <Card key={i} style={{ padding: 12, background: C.s2 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 12, color: C.mt, fontWeight: 600 }}>#{i + 1}</span>{form.exercises.length > 1 && <button onClick={() => rmEx(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dg, fontSize: 18 }}>✕</button>}</div>
              <Sel value={ex.name} onChange={e => upEx(i, "name", e.target.value)} options={[{ value: "", label: "— Pick —" }, ...EXDB.map(e => ({ value: e.name, label: `${e.name} (${e.muscle})` }))]} style={{ marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}><Input label="Sets" type="number" value={ex.sets} onChange={e => upEx(i, "sets", +e.target.value)} /><Input label="Reps" type="number" value={ex.reps} onChange={e => upEx(i, "reps", +e.target.value)} /><Input label="Rest(s)" type="number" value={ex.rest} onChange={e => upEx(i, "rest", +e.target.value)} /></div>
            </Card>
          ))}
          <Btn variant="secondary" onClick={addEx} style={{ width: "100%" }}>+ Exercise</Btn>
          <Btn onClick={save} style={{ width: "100%" }}>{editPlan ? "Update Plan" : "Save Plan"}</Btn>
        </div>
      </Modal>
    </div>
  );
}
