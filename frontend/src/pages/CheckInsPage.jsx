// ═══════════════════════════════════════════════════════════════════════
// CHECK-INS — weekly energy/sleep/stress/adherence questionnaire.
// Currently localStorage-only (not backend-synced) — see the CoachMe
// Bible Volume 2, Module 10 for the plan to make this coach-visible.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../theme/theme.js";
import { ls } from "../lib/storage.js";
import { Card, Badge, Btn, Input, TextArea, Modal, Empty, ST } from "../components/ui.jsx";

export default function CheckInsPage() {
  const [cks, setCks] = useState(ls.get("checkins", []));
  const [showF, setShowF] = useState(false);
  const [form, setForm] = useState({ energy: 7, sleep: 7, stress: 3, adherence: 80, weight: "", notes: "", mood: "good" });
  const moods = [{ v: "great", e: "😄" }, { v: "good", e: "🙂" }, { v: "okay", e: "😐" }, { v: "tired", e: "😴" }, { v: "bad", e: "😞" }];

  const submit = () => {
    const e = { ...form, id: Date.now(), date: new Date().toISOString().slice(0, 10), weight: +form.weight || 0 };
    const u = [...cks, e]; setCks(u); ls.set("checkins", u); setShowF(false);
  };

  return (
    <div>
      <ST right={<Btn onClick={() => setShowF(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Check-in</Btn>}>Check-ins</ST>
      {cks.length === 0 ? <Empty icon="📋" text="No check-ins yet" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cks.slice().reverse().map(c => (
            <Card key={c.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{c.date}</div>
                <span style={{ fontSize: 20 }}>{moods.find(m => m.v === c.mood)?.e || "🙂"}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                <div><span style={{ color: C.mt }}>Energy</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.energy}/10</span></div>
                <div><span style={{ color: C.mt }}>Sleep</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.sleep}/10</span></div>
                <div><span style={{ color: C.mt }}>Stress</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.stress}/10</span></div>
                <div><span style={{ color: C.mt }}>Adherence</span><br /><span style={{ color: C.tx, fontWeight: 600 }}>{c.adherence}%</span></div>
              </div>
              {c.notes && <div style={{ fontSize: 12, color: C.mt, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.bd}` }}>{c.notes}</div>}
            </Card>
          ))}
        </div>
      )}
      <Modal open={showF} onClose={() => setShowF(false)} title="Weekly Check-in">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>How are you feeling?</label>
            <div style={{ display: "flex", gap: 8 }}>
              {moods.map(m => <button key={m.v} onClick={() => setForm({ ...form, mood: m.v })} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", background: form.mood === m.v ? C.ac + "30" : C.s2, fontSize: 22, transition: "all .2s" }}>{m.e}</button>)}
            </div>
          </div>
          {[{ k: "energy", l: "Energy", mx: 10 }, { k: "sleep", l: "Sleep Quality", mx: 10 }, { k: "stress", l: "Stress Level", mx: 10 }].map(s => (
            <div key={s.k}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: C.mt }}>{s.l}</span><span style={{ color: C.tx, fontWeight: 600 }}>{form[s.k]}/{s.mx}</span></div>
              <input type="range" min="1" max={s.mx} value={form[s.k]} onChange={e => setForm({ ...form, [s.k]: +e.target.value })} style={{ width: "100%", accentColor: C.ac }} />
            </div>
          ))}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span style={{ color: C.mt }}>Plan Adherence</span><span style={{ color: C.tx, fontWeight: 600 }}>{form.adherence}%</span></div>
            <input type="range" min="0" max="100" step="5" value={form.adherence} onChange={e => setForm({ ...form, adherence: +e.target.value })} style={{ width: "100%", accentColor: C.ok }} />
          </div>
          <Input label="Weight (kg)" type="number" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} />
          <TextArea label="Notes / Wins / Struggles" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="How was your week?" />
          <Btn onClick={submit} style={{ width: "100%" }}>Submit</Btn>
        </div>
      </Modal>
    </div>
  );
}
