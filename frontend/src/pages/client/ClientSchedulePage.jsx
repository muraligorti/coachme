// ═══════════════════════════════════════════════════════════════════════
// CLIENT SCHEDULE — a client's upcoming/past sessions. Clients can only
// *request* cancellation or reschedule (never unilaterally act) — the
// coach approves. Available for both PENDING and CONFIRMED sessions —
// a client should be able to withdraw or adjust a request they made
// themselves before the coach has even acted on it, not just after.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { unwrap, cName, log } from "../../lib/utils.js";
import { Card, Badge, Btn, TextArea, Modal, Empty, ST, Spin } from "../../components/ui.jsx";
import RequestSessionModal from "./RequestSessionModal.jsx";
import RescheduleRequestModal from "./RescheduleRequestModal.jsx";
import { refreshSessionReminders } from "../../lib/localReminders.js";
import { useAuth } from "../../context/AuthContext.jsx";

export default function ClientSchedulePage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]); const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState(null); const [cancelReason, setCancelReason] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const load = () => api.get("/bookings").then(d => { const bk = unwrap(d, "bookings", "sessions"); log("Client bookings loaded:", bk.length); setBookings(bk); if (user?.id) refreshSessionReminders(user.id, bk); }).catch(e => { log("Client bookings error:", e.message); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const requestCancel = async () => {
    if (!cancelId) return;
    try {
      await api.post(`/bookings/${cancelId}/cancel-request`, { reason: cancelReason || "Schedule conflict" });
      setBookings(prev => prev.map(b => b.id === cancelId ? { ...b, status: "CANCEL_REQUESTED" } : b));
      setCancelId(null); setCancelReason("");
    } catch (e) { alert("Could not request cancellation: " + e.message); }
  };

  if (loading) return <Spin />;
  const now = new Date();
  const upcoming = bookings.filter(b => { try { const st = (b.status || "").toUpperCase(); return new Date(b.scheduledAt || b.date) >= now && st !== "CANCELLED"; } catch { return false; } }).sort((a, b) => new Date(a.scheduledAt || a.date) - new Date(b.scheduledAt || b.date));
  const past = bookings.filter(b => { try { return new Date(b.scheduledAt || b.date) < now; } catch { return false; } }).sort((a, b) => new Date(b.scheduledAt || b.date) - new Date(a.scheduledAt || a.date)).slice(0, 20);
  const statusColors = { confirmed: C.ok, pending: C.wn, completed: C.a2, cancelled: C.mt, cancel_requested: C.or, no_show: C.dg };
  // A client can act on their own session whether it's already confirmed
  // OR still awaiting the coach's decision — a pending request is still
  // theirs to withdraw or adjust, not just something to wait on silently.
  const canRequestChange = (st) => st === "confirmed" || st === "pending";

  return (
    <div>
      <ST right={<Btn onClick={() => setShowRequest(true)} style={{ padding: "8px 16px", fontSize: 13 }}>+ Request Session</Btn>}>My Schedule</ST>
      {upcoming.length === 0 ? <Empty icon="📅" text="No upcoming sessions" /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.mt, marginBottom: 4 }}>Upcoming</div>
          {upcoming.map(b => {
            const t = new Date(b.scheduledAt || b.date); const st = (b.status || "pending").toLowerCase();
            return (
              <Card key={b.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{t.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.ac }}>{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                    <div style={{ fontSize: 12, color: C.mt }}>{b.durationMinutes || 60}min · {cName(b.coach) || b.sessionType || "Session"}</div>
                  </div>
                  <Badge color={statusColors[st] || C.wn}>{st === "cancel_requested" ? "Cancel Pending" : st === "pending" && b.initiatedBy === "client" ? "Awaiting Coach" : st}</Badge>
                </div>
                {canRequestChange(st) && !b.requestedRescheduleAt && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setRescheduleTarget(b)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${C.ac}30`, background: C.ac + "10", color: C.ac, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Request Reschedule</button>
                    <button onClick={() => setCancelId(b.id)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: `1px solid ${C.dg}30`, background: C.dg + "10", color: C.dg, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Request Cancellation</button>
                  </div>
                )}
                {b.requestedRescheduleAt && (
                  <div style={{ fontSize: 12, color: C.ac, textAlign: "center", padding: 8, background: C.ac + "10", borderRadius: 8 }}>
                    🔄 Reschedule to {new Date(b.requestedRescheduleAt).toLocaleDateString()} {new Date(b.requestedRescheduleAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — awaiting your coach's approval
                  </div>
                )}
                {st === "cancel_requested" && <div style={{ fontSize: 12, color: C.or, textAlign: "center", padding: 4 }}>Waiting for coach approval</div>}
              </Card>
            );
          })}
        </div>
      )}
      {past.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.mt, marginBottom: 8 }}>Past Sessions</div>
          {past.map(b => {
            const t = new Date(b.scheduledAt || b.date); const st = (b.status || "").toLowerCase();
            return (
              <Card key={b.id} style={{ padding: 12, marginBottom: 6, opacity: .7 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{t.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>
                  <Badge color={statusColors[st] || C.mt}>{st}</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!cancelId} onClose={() => setCancelId(null)} title="Request Cancellation">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: C.mt }}>Your coach will be notified and must approve the cancellation.</div>
          <TextArea label="Reason (optional)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="e.g. Schedule conflict, feeling unwell..." />
          <Btn variant="danger" onClick={requestCancel} style={{ width: "100%", background: C.dg, color: "#fff" }}>Submit Cancellation Request</Btn>
        </div>
      </Modal>
      <RequestSessionModal open={showRequest} onClose={() => setShowRequest(false)} onRequested={load} />
      <RescheduleRequestModal booking={rescheduleTarget} onClose={() => setRescheduleTarget(null)} onRequested={load} />
    </div>
  );
}
