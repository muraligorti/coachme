// ═══════════════════════════════════════════════════════════════════════
// BOOKINGS / SCHEDULE — month + scrollable week calendar, day bookings
// with attendance/status controls, WhatsApp call + notification
// integration, schedule replication, holiday management, and launching
// a Live Session (voice-recorded workout logging).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap, cName, cPhone, log } from "../lib/utils.js";
import { Card, Badge, Btn, Input, TextArea, Sel, Modal, Empty, ST, Spin, Avatar } from "../components/ui.jsx";
import LiveSessionPage from "./LiveSessionPage.jsx";
import { refreshSessionReminders } from "../lib/localReminders.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function BookingsPage({ onNav }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]); const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false); const [showRepeat, setShowRepeat] = useState(false);
  const [clients, setClients] = useState([]); const [viewMode, setViewMode] = useState("week");
  const [activeSession, setActiveSession] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selDate, setSelDate] = useState(new Date().toISOString().slice(0, 10));
  const weekStripRef = useRef(null);
  const dateButtonRefs = useRef({});
  const [holidays, setHolidays] = useState(ls.get("holidays", []));
  const [form, setForm] = useState({ clientId: "", date: new Date().toISOString().slice(0, 10), time: "09:00", duration: 60, type: "training", mode: "ONLINE", notes: "" });
  const [repeatForm, setRepeatForm] = useState({ endDate: "", mode: "until_date", daysOfWeek: [1, 2, 3, 4, 5] });
  const [showCallSelect, setShowCallSelect] = useState(false);
  const [expandedBookingId, setExpandedBookingId] = useState(null); // which client row inside a batch box is showing full actions
  const [callSelections, setCallSelections] = useState({});
  const [showBatchMessage, setShowBatchMessage] = useState(false);
  const [batchMessageBookings, setBatchMessageBookings] = useState([]);
  const [batchMessageText, setBatchMessageText] = useState("");
  const [liveBatch, setLiveBatch] = useState(null); // bookings currently "in session" based on the clock, or null
  const [showActivePreview, setShowActivePreview] = useState(false);
  const [activePreviewPlans, setActivePreviewPlans] = useState({}); // clientId -> plans[]
  const [activePreviewToday, setActivePreviewToday] = useState({}); // clientId -> today's workout(s) with weekly count
  const [activeSessionTodayPlans, setActiveSessionTodayPlans] = useState({}); // carried into LiveSessionPage for exercise pre-fill
  const [activePreviewLoading, setActivePreviewLoading] = useState(false);

  const load = () => { Promise.all([api.get("/bookings").catch(() => ({})), api.get("/clients").catch(() => ({}))]).then(([b, c]) => {
    const bk = unwrap(b, "bookings", "sessions");
    setBookings(bk); setClients(unwrap(c, "clients"));
    if (user?.id) refreshSessionReminders(user.id, bk); // keeps THIS account's local reminders in sync — never touches another account's schedule if this device switches identities
  }).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);

  // ACTIVE SESSION detection — a "batch" whose scheduled window has
  // arrived (start time through end of duration, plus a 15-minute grace
  // window on each side for early/late starts) shows up here regardless
  // of which date is currently selected in the strip above. Re-checked
  // every 30s so the banner appears/disappears live, not just on reload.
  useEffect(() => {
    const END_GRACE_MS = 15 * 60000; // still shows for a bit after the scheduled end, in case the session is running long
    const checkLive = () => {
      const now = Date.now();
      const confirmed = bookings.filter(b => (b.status || "").toUpperCase() === "CONFIRMED");
      const inWindow = confirmed.filter(b => {
        const start = new Date(b.date || b.startTime || b.scheduledAt).getTime();
        const end = start + (b.durationMinutes || b.duration || 60) * 60000;
        return now >= start && now <= end + END_GRACE_MS; // no pre-start grace — was showing "Live Now" up to 15 minutes before the session actually began
      });
      if (inWindow.length === 0) { setLiveBatch(null); return; }
      // Group by exact start time — the "batch" is whichever time-window
      // is actually live right now (usually just one, but handles the
      // edge case of overlapping batches gracefully by picking the
      // closest-to-now group).
      const byTime = {};
      inWindow.forEach(b => { const k = new Date(b.date || b.startTime || b.scheduledAt).getTime(); (byTime[k] = byTime[k] || []).push(b); });
      const closest = Object.entries(byTime).sort((a, b) => Math.abs(+a[0] - now) - Math.abs(+b[0] - now))[0];
      setLiveBatch(closest ? closest[1] : null);
    };
    checkLive();
    const interval = setInterval(checkLive, 30000);
    return () => clearInterval(interval);
  }, [bookings]);

  const openActivePreview = async (bookingsForPreview) => {
    const target = bookingsForPreview || liveBatch;
    if (!target || target.length === 0) return;
    if (bookingsForPreview) setLiveBatch(bookingsForPreview); // so the modal's "Start Recording" button and header both reflect whichever batch is being previewed, not just the auto-detected one
    setShowActivePreview(true); setActivePreviewLoading(true);
    const plansByClient = {}; const todayByClient = {};
    await Promise.all(target.map(async (b) => {
      const cid = b.clientId || b.client?.id;
      if (!cid) return;
      try { const r = await api.get(`/workout-assignments/client/${cid}`); plansByClient[cid] = r.plans || []; } catch { plansByClient[cid] = []; }
      try { const rt = await api.get(`/workout-assignments/today/${cid}`); todayByClient[cid] = rt.workouts || []; } catch { todayByClient[cid] = []; }
    }));
    setActivePreviewPlans(plansByClient);
    setActivePreviewToday(todayByClient);
    setActivePreviewLoading(false);
  };

  // Schedule should focus on the selected date (today, by default) in the
  // horizontal week strip without the coach needing to scroll to find it
  // manually — this fires on mount (today) and whenever selDate changes.
  useEffect(() => {
    if (viewMode !== "week" || loading) return;
    const btn = dateButtonRefs.current[selDate];
    if (btn) btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selDate, viewMode, loading]);

  const createBooking = async (bookingData) => api.post("/bookings", bookingData);

  const save = async () => {
    if (!form.clientId) { alert("Please select a client"); return; }
    try {
      const me = await api.get("/auth/me").catch(() => null);
      const coachId = me?.profile?.id;
      if (!coachId) { alert("Could not resolve coach profile"); return; }
      await createBooking({ clientId: form.clientId, coachId, scheduledAt: new Date(form.date + "T" + form.time).toISOString(), durationMinutes: form.duration || 60, sessionType: form.mode || "ONLINE", notes: form.notes });
      setShowAdd(false); load();
    } catch (e) { alert("Booking error: " + e.message); }
  };

  const markAttendance = async (bid, status) => {
    try { await api.req(`/bookings/${bid}`, { method: "PATCH", body: JSON.stringify({ status: status.toUpperCase() }) }); } catch (e) { log("Attendance update failed:", e.message); }
    setBookings(prev => prev.map(b => b.id === bid ? { ...b, status } : b));
    if (status === "cancelled") load();
  };

  const replicateSchedule = async () => {
    const dayBk = getDateBookings(selDate);
    if (dayBk.length === 0) { alert("No sessions to replicate"); return; }
    const end = new Date(repeatForm.endDate); const start = new Date(selDate); start.setDate(start.getDate() + 1);
    let created = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (repeatForm.mode === "week_days" && !repeatForm.daysOfWeek.includes(dow)) continue;
      const iso = d.toISOString().slice(0, 10);
      if (holidays.includes(iso)) continue;
      for (const bk of dayBk) {
        const origTime = new Date(bk.date || bk.startTime || bk.scheduledAt);
        const timeStr = origTime.toTimeString().slice(0, 5);
        try {
          let coachId = bk.coachId || bk.coach?.id;
          if (!coachId) { try { const me = await api.get("/auth/me"); coachId = me?.profile?.id; } catch {} }
          await createBooking({ clientId: bk.clientId || bk.client?.id, coachId, scheduledAt: new Date(iso + "T" + timeStr).toISOString(), durationMinutes: bk.durationMinutes || bk.duration || 60, sessionType: bk.sessionType || (bk.type === "training" || bk.type === "group" ? "IN_PERSON" : "ONLINE"), notes: bk.notes || "" });
          created++;
        } catch {}
      }
    }
    alert(`Created ${created} sessions!`); setShowRepeat(false); load();
  };

  const toggleHoliday = (date) => { const u = holidays.includes(date) ? holidays.filter(h => h !== date) : [...holidays, date]; setHolidays(u); ls.set("holidays", u); };
  const cancelDay = async () => {
    const dayBk = getDateBookings(selDate);
    if (dayBk.length === 0) { alert("No sessions to cancel"); return; }
    if (!confirm(`Cancel ${dayBk.length} session(s) on ${selDate}?`)) return;
    for (const bk of dayBk) { markAttendance(bk.id, "cancelled"); }
    toggleHoliday(selDate); alert(`${dayBk.length} session(s) cancelled.`);
  };

  const sendWhatsAppToClient = (phone, message) => {
    const cleanPhone = String(phone || "").replace(/[\s\-\+\(\)]/g, "");
    const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : cleanPhone.startsWith("0") ? `91${cleanPhone.slice(1)}` : `91${cleanPhone}`;
    window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent(message)}`, "_blank");
  };
  const whatsAppCall = (phone) => {
    const cleanPhone = String(phone || "").replace(/[\s\-\+\(\)]/g, "");
    const intlPhone = cleanPhone.startsWith("91") ? cleanPhone : cleanPhone.startsWith("0") ? `91${cleanPhone.slice(1)}` : `91${cleanPhone}`;
    window.open(`https://wa.me/${intlPhone}`, "_blank");
  };

  const resolveClientPhone = (booking) => {
    let phone = booking.client?.phone || cPhone(booking.client);
    if (phone) return phone;
    const fullClient = clients.find(c => c.id === booking.clientId || c.id === booking.client?.id || c.userId === booking.client?.userId);
    if (fullClient) { phone = fullClient.phone || fullClient.user?.phone || cPhone(fullClient); if (phone) return phone; }
    const edits = ls.get("client_edits", {});
    const editId = booking.clientId || booking.client?.id;
    if (editId && edits[editId]?.phone) return edits[editId].phone;
    return "";
  };
  const resolveClientName = (booking) => {
    const fullClient = clients.find(c => c.id === booking.clientId || c.id === booking.client?.id);
    return cName(fullClient) || cName(booking.client) || booking.type || "Client";
  };

  const whatsAppGroupCall = () => {
    const dayBk = getDateBookings(selDate);
    if (dayBk.length === 0) { alert("No sessions on this day"); return; }
    const clientList = dayBk.map(b => ({ id: b.id, name: resolveClientName(b), phone: resolveClientPhone(b), time: new Date(b.date || b.startTime || b.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), duration: b.duration || 60, type: b.type || "training" }));
    const withPhone = clientList.filter(c => c.phone);
    if (withPhone.length === 0) { alert("No client phone numbers found.\n\nTo fix: Go to Clients → tap a client → ✏️ Edit → add their mobile number."); return; }
    const selections = {}; withPhone.forEach(c => { selections[c.id] = true; });
    setCallSelections(selections); setShowCallSelect(true);
  };

  const sendGroupCall = () => {
    const dayBk = getDateBookings(selDate);
    const selected = dayBk.filter(b => callSelections[b.id]);
    if (selected.length === 0) { alert("Select at least one client"); return; }
    if (selected.length === 1) { const phone = resolveClientPhone(selected[0]); if (phone) whatsAppCall(phone); setShowCallSelect(false); return; }
    const timeSlots = selected.map(b => { const t = new Date(b.date || b.startTime || b.scheduledAt); return `${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — ${resolveClientName(b)} (${b.duration || 60}min)`; }).join("\n");
    const msg = `🏋️ *CoachMe Session — ${new Date(selDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}*\n\n📅 Schedule:\n${timeSlots}\n\n📞 Joining the call at your session time.\nPlease be ready!\n\nSee you! 💪`;
    selected.forEach((b, i) => { const phone = resolveClientPhone(b); if (phone) setTimeout(() => sendWhatsAppToClient(phone, msg), i * 1000); });
    setShowCallSelect(false); alert(`Opening WhatsApp for ${selected.length} client(s)…`);
  };

  const sendBatchMessage = () => {
    if (!batchMessageText.trim()) { alert("Type a message first"); return; }
    const withPhone = batchMessageBookings.filter(b => resolveClientPhone(b));
    if (withPhone.length === 0) { alert("No phone numbers found for this batch.\n\nTo fix: Go to Clients → tap a client → ✏️ Edit → add their mobile number."); return; }
    withPhone.forEach((b, i) => { const phone = resolveClientPhone(b); setTimeout(() => sendWhatsAppToClient(phone, batchMessageText), i * 800); });
    setShowBatchMessage(false);
    alert(`Opening WhatsApp for ${withPhone.length} client(s)…`);
  };

  // Scoped version of cancelDayAndNotify — cancels + notifies only the
  // clients in ONE batch (one time-slot), not the coach's entire day.
  const cancelBatchAndNotify = async (batchBookings) => {
    if (batchBookings.length === 0) return;
    const t = new Date(batchBookings[0].date || batchBookings[0].startTime || batchBookings[0].scheduledAt);
    if (!confirm(`Cancel this ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} batch (${batchBookings.length} client${batchBookings.length !== 1 ? "s" : ""}) and notify them via WhatsApp?`)) return;
    for (const bk of batchBookings) { await markAttendance(bk.id, "cancelled"); }
    const msg = `❌ *Session Cancelled*\n\nHi! Your ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} session on ${t.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} has been cancelled.\n\nWe'll reschedule soon. Sorry for the inconvenience!\n\n— Your Coach via CoachMe.life`;
    batchBookings.forEach((bk, i) => { const phone = resolveClientPhone(bk); if (phone) setTimeout(() => sendWhatsAppToClient(phone, msg), i * 800); });
    alert(`Batch cancelled. WhatsApp notifications sent to ${batchBookings.filter(bk => resolveClientPhone(bk)).length} of ${batchBookings.length} client(s).`);
  };

  const cancelDayAndNotify = async () => {
    const dayBk = getDateBookings(selDate);
    if (dayBk.length === 0) { alert("No sessions to cancel"); return; }
    if (!confirm(`Cancel ${dayBk.length} session(s) on ${selDate} and notify clients via WhatsApp?`)) return;
    for (const bk of dayBk) { markAttendance(bk.id, "cancelled"); }
    toggleHoliday(selDate);
    const msg = `❌ *Session Cancelled*\n\nHi! Your session on ${new Date(selDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} has been cancelled.\n\nWe'll reschedule soon. Sorry for the inconvenience!\n\n— Your Coach via CoachMe.life`;
    dayBk.forEach((bk, i) => { const phone = resolveClientPhone(bk); if (phone) setTimeout(() => sendWhatsAppToClient(phone, msg), i * 800); });
    alert(`${dayBk.length} session(s) cancelled. WhatsApp notifications sent.`);
  };

  const getDateBookings = (dateStr) => bookings.filter(b => { try { const st = (b.status || "").toUpperCase(); return new Date(b.date || b.startTime || b.scheduledAt).toISOString().slice(0, 10) === dateStr && st !== "CANCELLED"; } catch { return false; } });

  const getMonthDays = () => {
    const y = currentMonth.getFullYear(), m = currentMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysInPrev = new Date(y, m, 0).getDate();
    const cells = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: daysInPrev - i, month: m - 1, faded: true });
    for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, month: m, faded: false });
    const remaining = 42 - cells.length;
    for (let i = 1; i <= remaining; i++) cells.push({ day: i, month: m + 1, faded: true });
    return cells;
  };
  const monthName = currentMonth.toLocaleString("default", { month: "long", year: "numeric" });
  const prevMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() - 1); setCurrentMonth(d); };
  const nextMonth = () => { const d = new Date(currentMonth); d.setMonth(d.getMonth() + 1); setCurrentMonth(d); };
  const todayStr = new Date().toISOString().slice(0, 10);

  const db = getDateBookings(selDate);
  const isHoliday = holidays.includes(selDate);

  if (loading) return <Spin />;
  if (activeSession) return <LiveSessionPage booking={activeSession} clients={clients} todaysWorkouts={activeSessionTodayPlans} onBack={() => setActiveSession(null)} onComplete={() => { setActiveSession(null); load(); }} />;

  return (
    <div>
      {liveBatch && (
        <div onClick={() => openActivePreview()} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, background: "linear-gradient(135deg, #ff4757 0%, #ff6348 100%)", marginBottom: 14, cursor: "pointer", boxShadow: "0 4px 16px rgba(255,71,87,.35)" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", animation: "pulse 1.2s ease infinite" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>🔴 Live Now — {new Date(liveBatch[0].date || liveBatch[0].startTime || liveBatch[0].scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} Batch</div>
            <div style={{ fontSize: 11, color: "#fff", opacity: .9 }}>{liveBatch.length} participant{liveBatch.length !== 1 ? "s" : ""} — tap to view roster &amp; planned workouts</div>
          </div>
          <span style={{ color: "#fff", fontSize: 18 }}>›</span>
        </div>
      )}
      <ST right={<div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button onClick={() => setViewMode(viewMode === "month" ? "week" : "month")} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.s2, color: C.mt }}>{viewMode === "month" ? "📅 Week" : "📆 Month"}</button>
        <Btn variant="secondary" onClick={() => setShowRepeat(true)} style={{ padding: "6px 10px", fontSize: 11 }}>🔁 Repeat</Btn>
        <Btn variant={isHoliday ? "danger" : "secondary"} onClick={() => isHoliday ? toggleHoliday(selDate) : cancelDayAndNotify()} style={{ padding: "6px 10px", fontSize: 11 }}>{isHoliday ? "✓ Off" : "🏖️"}</Btn>
        <button onClick={whatsAppGroupCall} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: "#25D36620", color: "#25D366" }} title="WhatsApp call all clients">📞 Call</button>
        <Btn onClick={() => setShowAdd(true)} style={{ padding: "6px 12px", fontSize: 12 }}>+ Book</Btn>
      </div>}>Schedule</ST>

      {viewMode === "month" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <button onClick={prevMonth} style={{ background: "none", border: "none", color: C.tx, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>‹</button>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>{monthName}</span>
            <button onClick={nextMonth} style={{ background: "none", border: "none", color: C.tx, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: C.mt, padding: "6px 0" }}>{d}</div>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {getMonthDays().map((cell, i) => {
              const y = currentMonth.getFullYear();
              const m = cell.month < 0 ? 11 : cell.month > 11 ? 0 : cell.month;
              const adjY = cell.month < 0 ? y - 1 : cell.month > 11 ? y + 1 : y;
              const iso = `${adjY}-${String(m + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
              const dayBk = getDateBookings(iso);
              const isSel = iso === selDate; const isToday = iso === todayStr;
              const isH = holidays.includes(iso);
              return (
                <button key={i} onClick={() => setSelDate(iso)} style={{ minHeight: 52, padding: 4, borderRadius: 8, border: isSel ? `2px solid ${C.ac}` : "none", cursor: "pointer", background: isH ? C.dg + "12" : isSel ? C.ac + "15" : isToday ? C.a2 + "12" : C.sf, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, opacity: cell.faded ? .4 : 1, transition: "all .15s", position: "relative" }}>
                  <span style={{ fontSize: 12, fontWeight: isToday || isSel ? 700 : 400, color: isH ? C.dg : isSel ? C.ac : isToday ? C.a2 : C.tx }}>{cell.day}</span>
                  {dayBk.length > 0 && <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center" }}>{dayBk.length <= 3 ? dayBk.map((_, j) => <div key={j} style={{ width: 6, height: 6, borderRadius: 3, background: C.ac }} />) : <span style={{ fontSize: 9, fontWeight: 600, color: C.ac }}>{dayBk.length}</span>}</div>}
                  {isH && <span style={{ fontSize: 7, color: C.dg, fontWeight: 600 }}>OFF</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "week" && (
        <div className="jz-scrollx" style={{ display: "flex", gap: 6, marginBottom: 16, paddingBottom: 2 }}>
          {(() => { const b = new Date(selDate); const s = new Date(b); s.setDate(b.getDate() - b.getDay() - 7); return Array.from({ length: 21 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; }); })().map((d, i) => {
            const iso = d.toISOString().slice(0, 10); const isSel = iso === selDate;
            const has = getDateBookings(iso).length > 0; const isH = holidays.includes(iso);
            return (
              <button key={i} ref={el => { if (el) dateButtonRefs.current[iso] = el; }} onClick={() => setSelDate(iso)} style={{ flexShrink: 0, width: 52, padding: "10px 2px", borderRadius: 12, border: "none", cursor: "pointer", background: isSel ? C.gr : isH ? C.dg + "20" : C.s2, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, boxShadow: isSel ? `0 4px 14px ${C.ac}45` : "none" }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: isSel ? "#fff" : isH ? C.dg : C.mt, textTransform: "uppercase" }}>{"Sun,Mon,Tue,Wed,Thu,Fri,Sat".split(",")[d.getDay()]}</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: isSel ? "#fff" : C.tx }}>{d.getDate()}</span>
                {has && <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSel ? "#fff" : C.ac }} />}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0 8px" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{new Date(selDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}{isHoliday && <Badge color={C.dg} style={{ marginLeft: 8 }}>Holiday</Badge>}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {db.filter(b => (b.status || "").toLowerCase() === "confirmed").length > 1 && <button onClick={() => openActivePreview(db.filter(b => (b.status || "").toLowerCase() === "confirmed"))} style={{ padding: "4px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.ac + "25", color: C.ac }}>🎙️ Group Session</button>}
          <span style={{ fontSize: 12, color: C.mt }}>{db.length} session(s)</span>
        </div>
      </div>

      {db.length === 0 ? <Empty icon={isHoliday ? "🏖️" : "📅"} text={isHoliday ? "Holiday — No sessions" : "No sessions this day"} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(() => {
            const sorted = db.sort((a, b) => new Date(a.date || a.startTime || a.scheduledAt) - new Date(b.date || b.startTime || b.scheduledAt));
            const timeKeyOf = (bk) => new Date(bk.date || bk.startTime || bk.scheduledAt).getTime();
            const statusColors = { present: C.ok, confirmed: C.ok, absent: C.dg, cancelled: C.mt, cancel_requested: C.or, late: C.wn, pending: C.wn };

            // Group into batches — every booking sharing the exact same
            // start time is one batch (e.g. a 9am group class). A batch
            // of 1 renders exactly like before (full card, nothing new).
            // A batch of 2+ renders as ONE box: shared time/duration/mode
            // shown once at the top, each client as a compact row that
            // expands in place to the full action set (Confirm/Cancel/
            // Reschedule/Live Session/etc.) — nothing lost, just collapsed
            // by default so a 4-person batch doesn't take 4 full cards.
            const batches = [];
            for (const b of sorted) {
              const key = timeKeyOf(b);
              const existing = batches.find(g => g.key === key);
              if (existing) existing.bookings.push(b); else batches.push({ key, bookings: [b] });
            }

            // The full action set for one booking — identical to the
            // original per-card markup, just extracted so both the
            // single-booking path and the expanded-row-in-a-batch path
            // can render it without duplicating the logic.
            const renderActions = (b) => {
              const st = (b.status || "pending").toLowerCase();
              return (
                <>
                  {st === "cancel_requested" && <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    <button onClick={() => markAttendance(b.id, "cancelled")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.ok + "20", color: C.ok }}>✅ Approve Cancel</button>
                    <button onClick={() => markAttendance(b.id, "confirmed")} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.dg + "20", color: C.dg }}>❌ Deny</button>
                  </div>}
                  {b.requestedRescheduleAt && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: C.ac, marginBottom: 4, textAlign: "center" }}>🔄 Client wants to move this to {new Date(b.requestedRescheduleAt).toLocaleDateString()} {new Date(b.requestedRescheduleAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{b.rescheduleReason ? ` — "${b.rescheduleReason}"` : ""}</div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={async () => { try { await api.post(`/booking-requests/${b.id}/reschedule-approve`); load(); } catch (e) { alert("Failed: " + e.message); } }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.ok + "20", color: C.ok }}>✅ Approve New Time</button>
                        <button onClick={async () => { try { await api.post(`/booking-requests/${b.id}/reschedule-deny`); load(); } catch (e) { alert("Failed: " + e.message); } }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.dg + "20", color: C.dg }}>❌ Deny, Keep Original</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 4 }}>
                    {st === "confirmed" && <button onClick={() => setActiveSession(b)} style={{ flex: 1, padding: "6px 2px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: C.ac + "30", color: C.ac }}>🎙️ Live Session</button>}
                    {[{ s: "confirmed", l: "✅ Confirm", c: C.ok }, { s: "cancelled", l: "🚫 Cancel", c: C.dg }, { s: "pending", l: "⏳ Pending", c: C.wn }].map(a => <button key={a.s} onClick={() => markAttendance(b.id, a.s)} style={{ flex: 1, padding: "6px 2px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: st === a.s ? a.c + "30" : C.s2, color: st === a.s ? a.c : C.mt }}>{a.l}</button>)}
                  </div>
                </>
              );
            };

            return batches.map(({ key, bookings: batchBookings }) => {
              if (batchBookings.length === 1) {
                // Single booking — unchanged from before, full card.
                const b = batchBookings[0];
                const t = new Date(b.date || b.startTime || b.scheduledAt);
                const clientName = cName(b.client) || b.type || "Session";
                const st = (b.status || "pending").toLowerCase();
                return (
                  <Card key={b.id} style={{ padding: 14, ...(st === "pending" && b.initiatedBy === "client" ? { borderColor: C.ac + "60" } : {}) }}>
                    {st === "pending" && b.initiatedBy === "client" && <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, background: C.ac + "18", padding: "3px 8px", borderRadius: 6, display: "inline-block", marginBottom: 8 }}>🙋 Client Requested — needs your decision</div>}
                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                      <div style={{ width: 50, padding: "6px 0", borderRadius: 8, background: C.ac + "15", textAlign: "center" }}><div style={{ fontSize: 13, fontWeight: 700, color: C.ac }}>{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></div>
                      <Avatar src={b.client?.avatar} name={clientName} size={36} radius={10} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{clientName}</div>
                        <div style={{ fontSize: 12, color: C.mt }}>{b.duration || 60}min · {b.type || "training"} · {b.sessionType === "IN_PERSON" ? "📍 Offline" : b.sessionType === "HYBRID" ? "🔀 Hybrid" : "💻 Online"}{b._local ? " · 📱 Local" : ""}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {onNav && (b.clientId || b.client?.id) && <button onClick={(e) => { e.stopPropagation(); onNav("clients", { clientId: b.clientId || b.client?.id, tab: "workouts" }); }} style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", background: C.ac + "18", color: C.ac, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }} title="View their workout plan">💪</button>}
                        {resolveClientPhone(b) && <button onClick={(e) => { e.stopPropagation(); whatsAppCall(resolveClientPhone(b)); }} style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", background: "#25D36620", color: "#25D366", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }} title="WhatsApp Call">📞</button>}
                        <Badge color={statusColors[st] || C.wn}>{st === "cancel_requested" ? "⚠️ Cancel Request" : st}</Badge>
                      </div>
                    </div>
                    {renderActions(b)}
                  </Card>
                );
              }

              // Batch of 2+ — one box, compact rows, tap to expand.
              const t = new Date(batchBookings[0].date || batchBookings[0].startTime || batchBookings[0].scheduledAt);
              const first = batchBookings[0];
              return (
                <div key={key} style={{ background: "linear-gradient(160deg,#181f2c 0%,#12161f 100%)", border: `1px solid ${C.bd}`, borderRadius: 16, padding: 14, boxShadow: "0 6px 20px rgba(0,0,0,.25)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${C.bd}` }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.ac }}>{t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} Batch</div>
                      <div style={{ fontSize: 10.5, color: C.mt, marginTop: 1 }}>{first.duration || 60}min · {first.sessionType === "IN_PERSON" ? "📍 Offline" : first.sessionType === "HYBRID" ? "🔀 Hybrid" : "💻 Online"} · {batchBookings.length} participants</div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setBatchMessageBookings(batchBookings); setBatchMessageText(""); setShowBatchMessage(true); }} style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: "#25D36620", color: "#25D366" }}>📢 Message Batch</button>
                      <button onClick={() => cancelBatchAndNotify(batchBookings)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.dg + "20", color: C.dg }}>❌ Cancel Batch</button>
                    </div>
                  </div>
                  {batchBookings.map(b => {
                    const clientName = cName(b.client) || b.type || "Session";
                    const st = (b.status || "pending").toLowerCase();
                    const expanded = expandedBookingId === b.id;
                    return (
                      <div key={b.id} style={{ borderBottom: `1px solid rgba(255,255,255,.04)`, paddingBottom: 8, marginBottom: 8 }}>
                        <div onClick={() => setExpandedBookingId(expanded ? null : b.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", cursor: "pointer" }}>
                          <Avatar src={b.client?.avatar} name={clientName} size={30} radius={9} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{clientName}</div>
                            {st === "pending" && b.initiatedBy === "client" && <div style={{ fontSize: 9.5, fontWeight: 700, color: C.ac }}>🙋 Needs your decision</div>}
                          </div>
                          <Badge color={statusColors[st] || C.wn} style={{ fontSize: 9.5 }}>{st === "cancel_requested" ? "⚠️ Cancel Req" : st}</Badge>
                          <span style={{ color: C.mt, fontSize: 12 }}>{expanded ? "▴" : "▾"}</span>
                        </div>
                        {expanded && <div style={{ paddingLeft: 40, paddingTop: 4 }}>{renderActions(b)}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Book Session">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clients.length > 0 && <Sel label="Client" value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} options={[{ value: "", label: "— Select Client —" }, ...clients.map(c => ({ value: c.id, label: cName(c) }))]} />}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /><Input label="Time" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Duration (min)" type="number" value={form.duration} onChange={e => setForm({ ...form, duration: +e.target.value })} />
            <Sel label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} options={[{ value: "training", label: "Training" }, { value: "assessment", label: "Assessment" }, { value: "consultation", label: "Consultation" }, { value: "group", label: "Group Class" }]} />
          </div>
          <Sel label="Mode" value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} options={[{ value: "ONLINE", label: "💻 Online" }, { value: "IN_PERSON", label: "📍 Offline (In-person)" }, { value: "HYBRID", label: "🔀 Hybrid" }]} />
          <TextArea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <Btn onClick={save} disabled={!form.clientId || !form.date || !form.time} style={{ width: "100%" }}>Confirm Booking</Btn>
        </div>
      </Modal>

      <Modal open={showRepeat} onClose={() => setShowRepeat(false)} title="Replicate Schedule">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 12, background: C.s2, borderRadius: 10, fontSize: 12, color: C.mt }}>Copy {db.length} session(s) from <strong style={{ color: C.tx }}>{selDate}</strong> to future dates</div>
          <Sel label="Repeat Mode" value={repeatForm.mode} onChange={e => setRepeatForm({ ...repeatForm, mode: e.target.value })} options={[{ value: "until_date", label: "Every day until end date" }, { value: "week_days", label: "Specific days of the week" }]} />
          {repeatForm.mode === "week_days" && <div>
            <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 6, display: "block" }}>Days</label>
            <div style={{ display: "flex", gap: 4 }}>{"S,M,T,W,T,F,S".split(",").map((d, i) => <button key={i} onClick={() => { const dw = repeatForm.daysOfWeek.includes(i) ? repeatForm.daysOfWeek.filter(x => x !== i) : [...repeatForm.daysOfWeek, i]; setRepeatForm({ ...repeatForm, daysOfWeek: dw }); }} style={{ width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: repeatForm.daysOfWeek.includes(i) ? C.ac : C.s2, color: repeatForm.daysOfWeek.includes(i) ? "#fff" : C.mt }}>{d}</button>)}</div>
          </div>}
          <Input label="End Date" type="date" value={repeatForm.endDate} onChange={e => setRepeatForm({ ...repeatForm, endDate: e.target.value })} />
          <Btn onClick={replicateSchedule} disabled={!repeatForm.endDate || db.length === 0} style={{ width: "100%" }}>🔁 Replicate {db.length} Session(s)</Btn>
        </div>
      </Modal>

      <Modal open={showCallSelect} onClose={() => setShowCallSelect(false)} title="📞 WhatsApp Group Call">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 13, color: C.mt, marginBottom: 4 }}>Select clients to include in the group call for <strong style={{ color: C.tx }}>{new Date(selDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</strong>:</div>
          {getDateBookings(selDate).map(b => {
            const name = resolveClientName(b); const phone = resolveClientPhone(b);
            const time = new Date(b.date || b.startTime || b.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const hasPhone = !!phone;
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: callSelections[b.id] ? C.ok + "12" : C.s2, border: `1px solid ${callSelections[b.id] ? C.ok + "30" : C.bd}`, cursor: hasPhone ? "pointer" : "default", opacity: hasPhone ? 1 : 0.5 }} onClick={() => { if (!hasPhone) return; setCallSelections(s => ({ ...s, [b.id]: !s[b.id] })); }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${callSelections[b.id] ? C.ok : C.bd}`, background: callSelections[b.id] ? C.ok : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", flexShrink: 0 }}>{callSelections[b.id] ? "✓" : ""}</div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{name}</div><div style={{ fontSize: 11, color: C.mt }}>{time} · {b.duration || 60}min · {b.type || "training"}</div></div>
                <div style={{ textAlign: "right" }}>{hasPhone ? <div style={{ fontSize: 12, color: C.ok }}>📱 {phone}</div> : <div style={{ fontSize: 11, color: C.dg }}>No phone</div>}</div>
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => { const all = {}; getDateBookings(selDate).forEach(b => { if (resolveClientPhone(b)) all[b.id] = true; }); setCallSelections(all); }} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: C.s2, color: C.mt }}>Select All</button>
            <button onClick={() => setCallSelections({})} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: C.s2, color: C.mt }}>Deselect All</button>
          </div>
          <Btn onClick={sendGroupCall} disabled={Object.values(callSelections).filter(Boolean).length === 0} style={{ width: "100%", marginTop: 4 }}>📞 Call {Object.values(callSelections).filter(Boolean).length} Client(s) via WhatsApp</Btn>
        </div>
      </Modal>

      <Modal open={showBatchMessage} onClose={() => setShowBatchMessage(false)} title="📢 Message This Batch">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: C.mt }}>Sending to <strong style={{ color: C.tx }}>{batchMessageBookings.length}</strong> client(s) in this batch:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {batchMessageBookings.map(b => <Badge key={b.id} color={resolveClientPhone(b) ? C.ok : C.dg}>{resolveClientName(b)}{!resolveClientPhone(b) ? " (no phone)" : ""}</Badge>)}
          </div>
          <TextArea label="Message" value={batchMessageText} onChange={e => setBatchMessageText(e.target.value)} placeholder="e.g. Reminder: bring your own mat for today's session!" style={{ minHeight: 100 }} />
          <Btn onClick={sendBatchMessage} disabled={!batchMessageText.trim()} style={{ width: "100%" }}>📤 Send via WhatsApp to {batchMessageBookings.filter(b => resolveClientPhone(b)).length} Client(s)</Btn>
        </div>
      </Modal>

      <Modal open={showActivePreview} onClose={() => setShowActivePreview(false)} title="🔴 Live Session Roster" wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {activePreviewLoading ? <Spin /> : (
            <div className="jz-scrollx" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
              {(liveBatch || []).map(b => {
                const cid = b.clientId || b.client?.id;
                const plans = activePreviewPlans[cid] || [];
                const today = activePreviewToday[cid] || [];
                return (
                  <div key={b.id} style={{ flex: "0 0 150px", background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${C.bd}` }}>
                      <Avatar src={b.client?.avatar} name={resolveClientName(b)} size={26} radius={8} />
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.tx, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{resolveClientName(b)}</div>
                    </div>
                    {today.length > 0 ? (
                      // Scheduled for today (via day-wise mapping) — shown
                      // prominently, distinct from just "one of their plans".
                      today.map(tw => (
                        <div key={tw.plan.id} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: C.ac, letterSpacing: .3, marginBottom: 2 }}>TODAY</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{tw.plan.title || tw.plan.name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, color: tw.completedThisWeek > 0 ? C.ok : C.wn, background: C.s2, borderRadius: 8, padding: "4px 6px", marginBottom: 6 }}>
                            {tw.completedThisWeek > 0 ? "✓" : "○"} {tw.completedThisWeek > 0 ? `Done ${tw.completedThisWeek}× this week` : "Not done yet this week"}
                          </div>
                          {tw.plan.exercises && Array.isArray(tw.plan.exercises) && tw.plan.exercises.slice(0, 8).map((ex, i) => (
                            <div key={i} style={{ fontSize: 10.5, color: C.tx, background: C.s2, borderRadius: 6, padding: "5px 7px", marginBottom: 4, lineHeight: 1.3 }}>
                              {ex.name || ex}{ex.sets ? <span style={{ color: C.ac, fontWeight: 700 }}> {ex.sets}×{ex.reps}</span> : ""}
                            </div>
                          ))}
                        </div>
                      ))
                    ) : plans.length === 0 ? (
                      <div style={{ fontSize: 11, color: C.mt }}>No plan assigned</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.mt, letterSpacing: .3, marginBottom: 6 }}>NO PLAN SCHEDULED TODAY</div>
                        {plans.map(p => (
                          <div key={p.id} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: C.ac, marginBottom: 4 }}>{p.title || p.name}</div>
                            {p.exercises && Array.isArray(p.exercises) && p.exercises.slice(0, 8).map((ex, i) => (
                              <div key={i} style={{ fontSize: 10.5, color: C.tx, background: C.s2, borderRadius: 6, padding: "5px 7px", marginBottom: 4, lineHeight: 1.3 }}>
                                {ex.name || ex}{ex.sets ? <span style={{ color: C.ac, fontWeight: 700 }}> {ex.sets}×{ex.reps}</span> : ""}
                              </div>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <Btn onClick={() => { setShowActivePreview(false); setActiveSessionTodayPlans(activePreviewToday); setActiveSession(liveBatch); }} style={{ width: "100%" }}>🎙️ Start Recording This Session</Btn>
        </div>
      </Modal>
    </div>
  );
}
