// ═══════════════════════════════════════════════════════════════════════
// HABIT TRACKER — daily checklist with streak counting.
// NOW BACKEND-REAL: a client manages their own habits (create/toggle/
// delete), a coach can VIEW (read-only, no toggling someone else's
// habits) a roster client's habits and streaks — gated server-side by
// an active coach-client relationship, same boundary as CheckInsPage.
//
// Role-aware via the optional `cid` prop, same pattern as CheckInsPage.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Btn, Input, Modal, Empty, Spin } from "../components/ui.jsx";

export default function HabitTracker({ cid }) {
  const isCoachView = !!cid;
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newH, setNewH] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });

  const load = () => {
    const path = isCoachView ? `/habits/client/${cid}` : "/habits";
    api.get(path).then(r => setHabits(r.habits || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [cid]);

  const toggle = async (habitId, date) => {
    if (isCoachView) return; // read-only for coaches, enforced here too, not just visually
    try { await api.post(`/habits/${habitId}/toggle`, { date }); load(); } catch (e) { alert("Could not update: " + e.message); }
  };

  const addH = async () => {
    if (!newH.trim()) return;
    try { await api.post("/habits", { name: newH }); setNewH(""); setShowAdd(false); load(); } catch (e) { alert("Could not add habit: " + e.message); }
  };

  const dn = ["S", "M", "T", "W", "T", "F", "S"];

  if (loading) return <Spin />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>{isCoachView ? "Habits" : "Daily Habits"}</span>
        {!isCoachView && <Btn onClick={() => setShowAdd(true)} style={{ padding: "6px 14px", fontSize: 12 }}>+ Habit</Btn>}
      </div>
      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      {habits.length === 0 ? <Empty icon="✅" text={isCoachView ? "This client hasn't set up any habits yet" : "No habits yet — tap + Habit to start one"} /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr repeat(7,32px)", gap: 4, marginBottom: 8, alignItems: "center" }}>
            <div />{last7.map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: d === today ? C.ac : C.mt }}>{dn[new Date(d).getDay()]}</div>)}
          </div>
          {habits.map(h => (
            <div key={h.id} style={{ display: "grid", gridTemplateColumns: "1fr repeat(7,32px)", gap: 4, marginBottom: 8, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 16 }}>{h.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                  {h.streak > 0 && <div style={{ fontSize: 10, color: C.or }}>🔥 {h.streak}d</div>}
                </div>
              </div>
              {last7.map(d => <button key={d} onClick={() => toggle(h.id, d)} disabled={isCoachView} style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: isCoachView ? "default" : "pointer", background: h.log[d] ? C.ok : C.s2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", transition: "all .2s", opacity: isCoachView && !h.log[d] ? .6 : 1 }}>{h.log[d] ? "✓" : ""}</button>)}
            </div>
          ))}
        </>
      )}
      {!isCoachView && (
        <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Habit">
          <Input label="Habit Name" value={newH} onChange={e => setNewH(e.target.value)} placeholder="e.g. Meditate 10 min" />
          <Btn onClick={addH} style={{ width: "100%", marginTop: 12 }}>Add</Btn>
        </Modal>
      )}
    </div>
  );
}
