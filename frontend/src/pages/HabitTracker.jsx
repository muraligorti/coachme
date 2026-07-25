// ═══════════════════════════════════════════════════════════════════════
// HABIT TRACKER — daily checklist with streak counting. Currently
// localStorage-only (not backend-synced) — see the CoachMe Bible Volume
// 2, Module 10 for the plan to make this a real, coach-visible feature.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../theme/theme.js";
import { ls } from "../lib/storage.js";
import { Btn, Input, Modal } from "../components/ui.jsx";

export default function HabitTracker({ cid }) {
  const key = `hab_${cid || "me"}`;
  const [habits, setHabits] = useState(ls.get(key, [
    { id: 1, name: "Drink 3L Water", icon: "💧", streak: 0, log: {} },
    { id: 2, name: "8h Sleep", icon: "😴", streak: 0, log: {} },
    { id: 3, name: "10k Steps", icon: "🚶", streak: 0, log: {} },
    { id: 4, name: "Eat Vegetables", icon: "🥦", streak: 0, log: {} },
  ]));
  const [showAdd, setShowAdd] = useState(false);
  const [newH, setNewH] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().slice(0, 10); });

  const toggle = (hid, date) => {
    const u = habits.map(h => {
      if (h.id !== hid) return h;
      const l = { ...h.log }; l[date] = !l[date];
      let s = 0; const d = new Date();
      while (l[d.toISOString().slice(0, 10)]) { s++; d.setDate(d.getDate() - 1); }
      return { ...h, log: l, streak: s };
    });
    setHabits(u); ls.set(key, u);
  };

  const addH = () => {
    if (!newH.trim()) return;
    const u = [...habits, { id: Date.now(), name: newH, icon: "✨", streak: 0, log: {} }];
    setHabits(u); ls.set(key, u); setNewH(""); setShowAdd(false);
  };

  const dn = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>Daily Habits</span>
        <Btn onClick={() => setShowAdd(true)} style={{ padding: "6px 14px", fontSize: 12 }}>+ Habit</Btn>
      </div>
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
          {last7.map(d => <button key={d} onClick={() => toggle(h.id, d)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", background: h.log[d] ? C.ok : C.s2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", transition: "all .2s" }}>{h.log[d] ? "✓" : ""}</button>)}
        </div>
      ))}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Habit">
        <Input label="Habit Name" value={newH} onChange={e => setNewH(e.target.value)} placeholder="e.g. Meditate 10 min" />
        <Btn onClick={addH} style={{ width: "100%", marginTop: 12 }}>Add</Btn>
      </Modal>
    </div>
  );
}
