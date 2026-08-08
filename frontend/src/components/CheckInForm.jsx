// ═══════════════════════════════════════════════════════════════════════
// CHECK-IN FORM — the actual fields (mood, energy/sleep/stress sliders,
// adherence, weight, notes). Extracted from CheckInsPage so both the
// coach's per-client check-in flow and the client's own Progress page
// can share one implementation instead of drifting apart over time.
// Controlled component: caller owns the form state and submit handler,
// this just renders the fields and a submit button.
// ═══════════════════════════════════════════════════════════════════════
import { C } from "../theme/theme.js";
import { Btn, Input, TextArea } from "./ui.jsx";

export const MOODS = [{ v: "great", e: "😄" }, { v: "good", e: "🙂" }, { v: "okay", e: "😐" }, { v: "tired", e: "😴" }, { v: "bad", e: "😞" }];

export default function CheckInForm({ form, setForm, onSubmit, notesPlaceholder = "How was your week?", submitLabel = "Submit" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>How are you feeling?</label>
        <div style={{ display: "flex", gap: 8 }}>
          {MOODS.map(m => <button key={m.v} onClick={() => setForm({ ...form, mood: m.v })} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", background: form.mood === m.v ? C.ac + "30" : C.s2, fontSize: 22, transition: "all .2s" }}>{m.e}</button>)}
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
      <TextArea label="Notes / Wins / Struggles" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={notesPlaceholder} />
      <Btn onClick={onSubmit} style={{ width: "100%" }}>{submitLabel}</Btn>
    </div>
  );
}
