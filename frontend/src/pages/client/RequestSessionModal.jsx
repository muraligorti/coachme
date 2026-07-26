// ═══════════════════════════════════════════════════════════════════════
// REQUEST SESSION — a client picks a date, sees their coach's busy
// blocks for that day (grayed out, not selectable), picks an open hourly
// slot, and submits a request. Lands as PENDING on the coach's calendar;
// the coach's existing Confirm/Cancel quick-actions (already in
// BookingsPage) are what actually accept or reject it — this modal only
// handles the client's half of the flow.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Modal, Btn, Input, Sel, TextArea, Spin } from "../../components/ui.jsx";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6am - 8pm, hourly slots

export default function RequestSessionModal({ open, onClose, onRequested }) {
  const [coaches, setCoaches] = useState([]);
  const [coachId, setCoachId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [duration, setDuration] = useState(60);
  const [mode, setMode] = useState("ONLINE");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState([]);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    api.get("/booking-requests/my-coaches").then(r => {
      const list = r.coaches || [];
      setCoaches(list);
      if (list.length === 1) setCoachId(list[0].id);
    }).catch(e => setError(e.message));
  }, [open]);

  useEffect(() => {
    if (!coachId || !date) return;
    setLoadingBusy(true); setSelectedHour(null); setError("");
    api.get(`/booking-requests/availability/${coachId}?date=${date}`)
      .then(r => setBusy(r.busy || []))
      .catch(e => setError(e.message))
      .finally(() => setLoadingBusy(false));
  }, [coachId, date]);

  const isHourBusy = (hour) => {
    const slotStart = new Date(date + "T00:00:00"); slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);
    return busy.some(b => new Date(b.start) < slotEnd && new Date(b.end) > slotStart);
  };

  const submit = async () => {
    if (!coachId || selectedHour === null) return;
    setSubmitting(true); setError("");
    const scheduledAt = new Date(date + "T00:00:00"); scheduledAt.setHours(selectedHour, 0, 0, 0);
    try {
      await api.post("/booking-requests", { coachId, scheduledAt: scheduledAt.toISOString(), durationMinutes: duration, sessionType: mode, notes });
      onRequested?.();
      onClose();
    } catch (e) {
      if (e.message.includes("no longer available")) { setError(e.message); setBusy(prev => [...prev]); /* trigger a re-check on next date/coach change */ }
      else setError(e.message);
    }
    setSubmitting(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Request a Session" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {coaches.length > 1 && (
          <Sel label="Coach" value={coachId} onChange={e => setCoachId(e.target.value)} options={[{ value: "", label: "— Select —" }, ...coaches.map(c => ({ value: c.id, label: c.displayName }))]} />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Input label="Date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} />
          <Sel label="Duration" value={duration} onChange={e => setDuration(+e.target.value)} options={[{ value: 30, label: "30 min" }, { value: 45, label: "45 min" }, { value: 60, label: "60 min" }, { value: 90, label: "90 min" }]} />
        </div>
        <Sel label="Mode" value={mode} onChange={e => setMode(e.target.value)} options={[{ value: "ONLINE", label: "💻 Online" }, { value: "IN_PERSON", label: "📍 Offline (In-person)" }, { value: "HYBRID", label: "🔀 Hybrid" }]} />

        <div>
          <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>Pick an available time</label>
          {!coachId ? <div style={{ fontSize: 12, color: C.mt }}>Select a coach first</div> :
            loadingBusy ? <Spin /> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {HOURS.map(h => {
                  const taken = isHourBusy(h);
                  const sel = selectedHour === h;
                  const label = h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
                  return (
                    <button key={h} disabled={taken} onClick={() => setSelectedHour(h)} style={{ padding: "10px 4px", borderRadius: 10, border: "none", cursor: taken ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, background: taken ? C.bd : sel ? C.gr : C.s2, color: taken ? C.mt : sel ? "#fff" : C.tx, opacity: taken ? 0.5 : 1, textDecoration: taken ? "line-through" : "none" }}>{label}</button>
                  );
                })}
              </div>
            )}
        </div>

        <TextArea label="Notes for your coach (optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything they should know before this session?" />
        {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
        <div style={{ fontSize: 11, color: C.mt }}>Your coach will confirm or decline this request — it won't appear as a confirmed session until they do.</div>
        <Btn onClick={submit} disabled={!coachId || selectedHour === null || submitting} style={{ width: "100%" }}>{submitting ? "Sending…" : "Send Request"}</Btn>
      </div>
    </Modal>
  );
}
