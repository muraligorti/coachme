// ═══════════════════════════════════════════════════════════════════════
// CLIENT SCHEDULE — a client's upcoming/past sessions. Clients can only
// *request* cancellation (never unilaterally cancel) — the coach approves.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { api } from "../../lib/api.js";
import { unwrap, cName, log } from "../../lib/utils.js";
import { Card, Badge, Btn, TextArea, Modal, Empty, ST, Spin } from "../../components/ui.jsx";

export default function ClientSchedulePage() {
  const [bookings, setBookings] = useState([]); const [loading, setLoading] = useState(true);
  const [cancelId, setCancelId] = useState(null); const [cancelReason, setCancelReason] = useState("");

  useEffect(() => { api.get("/bookings").then(d => { const bk = unwrap(d, "bookings", "sessions"); log("Client bookings loaded:", bk.length); setBookings(bk); }).catch(e => { log("Client bookings error:", e.message); }).finally(() => setLoading(false)); }, []);

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

  return (
    <div>
      <ST>My Schedule</ST>
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
                  <Badge color={statusColors[st] || C.wn}>{st === "cancel_requested" ? "Cancel Pending" : st}</Badge>
                </div>
                {st === "confirmed" && <button onClick={() => setCancelId(b.id)} style={{ width: "100%", padding: "8px", borderRadius: 8, border: `1px solid ${C.dg}30`, background: C.dg + "10", color: C.dg, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Request Cancellation</button>}
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
    </div>
  );
}
