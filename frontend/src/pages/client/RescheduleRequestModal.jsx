// ═══════════════════════════════════════════════════════════════════════
// RESCHEDULE REQUEST — a client proposes a new time for an EXISTING
// booking. Mirrors the existing "Request Cancellation" pattern: nothing
// changes about the session until the coach explicitly approves — the
// original time stays authoritative the whole time this is pending.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { Modal, Btn, Input, Sel, TextArea, Spin } from "../../components/ui.jsx";

const HOURS = Array.from({ length: 15 }, (_, i) => i + 6); // 6am - 8pm

export default function RescheduleRequestModal({ booking, onClose, onRequested }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState([]);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const coachId = booking?.coachId || booking?.coach?.id;
  const duration = booking?.durationMinutes || booking?.duration || 60;

  useEffect(() => {
    if (!booking || !coachId) return;
    setLoadingBusy(true); setSelectedHour(null); setError("");
    api.get(`/booking-requests/availability/${coachId}?date=${date}`)
      .then(r => setBusy((r.busy || []).filter(b => new Date(b.start).getTime() !== new Date(booking.scheduledAt || booking.date).getTime()))) // don't show this booking's own current slot as "busy"
      .catch(e => setError(e.message))
      .finally(() => setLoadingBusy(false));
  }, [booking, date]);

  const isHourBusy = (hour) => {
    const slotStart = new Date(date + "T00:00:00"); slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + duration * 60000);
    return busy.some(b => new Date(b.start) < slotEnd && new Date(b.end) > slotStart);
  };

  const submit = async () => {
    if (selectedHour === null) return;
    setSubmitting(true); setError("");
    const scheduledAt = new Date(date + "T00:00:00"); scheduledAt.setHours(selectedHour, 0, 0, 0);
    try {
      await api.post(`/booking-requests/${booking.id}/reschedule-request`, { scheduledAt: scheduledAt.toISOString(), reason });
      onRequested?.();
      onClose();
    } catch (e) { setError(e.message); }
    setSubmitting(false);
  };

  if (!booking) return null;
  const currentTime = new Date(booking.scheduledAt || booking.date);

  return (
    <Modal open={!!booking} onClose={onClose} title="Request Reschedule" wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 13, color: C.mt, padding: "10px 14px", background: C.s2, borderRadius: 10 }}>
          Currently: <b style={{ color: C.tx }}>{currentTime.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} at {currentTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</b>
        </div>
        <Input label="New date" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} />
        <div>
          <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>Pick a new time</label>
          {loadingBusy ? <Spin /> : (
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
        <TextArea label="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Schedule conflict came up" />
        {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
        <div style={{ fontSize: 11, color: C.mt }}>Your current session stays as-is until your coach approves this new time.</div>
        <Btn onClick={submit} disabled={selectedHour === null || submitting} style={{ width: "100%" }}>{submitting ? "Sending…" : "Send Reschedule Request"}</Btn>
      </div>
    </Modal>
  );
}
