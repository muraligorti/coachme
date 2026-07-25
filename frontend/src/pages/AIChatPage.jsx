// ═══════════════════════════════════════════════════════════════════════
// AI CHAT — CoachMe AI assistant. Three layers of intelligence stacked:
//   1. executeAction() — regex-matched intents that DIRECTLY call real
//      API endpoints (add client, book session, create workout, etc.)
//      before the AI model is even asked anything.
//   2. gatherContext() — pulls the coach's real, current data (clients,
//      bookings, revenue, leads) and hands it to Claude as grounding.
//   3. generateLocalResponse() — a deterministic fallback if the AI
//      returns something too generic to be useful.
// Plus voice input/output and markdown-lite message formatting.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { unwrap, cName, cEmail, cPhone } from "../lib/utils.js";

export default function AIChatPage() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Hey! I'm **CoachMe AI** — your intelligent fitness coaching assistant.\n\nI have full access to your data and can search the web. Here's what I can do:\n\n- **Add/edit/find/delete clients**\n- **Book or cancel sessions**\n- **Create & edit workout plans**\n- **Search for new exercises, nutrition plans & fitness research**\n- **Show your schedule & revenue stats**\n\nAsk me anything — from managing clients to finding the best HIIT workouts!", ts: new Date().toISOString() }]);
  const [input, setInput] = useState(""); const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true); const [isListening, setIsListening] = useState(false);
  const br = useRef(null); const recognitionRef = useRef(null); const textareaRef = useRef(null);

  useEffect(() => { setTimeout(() => { br.current?.scrollIntoView({ behavior: "smooth" }); }, 50); }, [msgs, loading]);
  useEffect(() => { textareaRef.current?.focus(); }, []);

  const speakText = (text) => {
    if (!voiceOn || !("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const clean = text.replace(/[^\w\s.,!?;:'\-—]/g, "").replace(/\n+/g, ". ").slice(0, 600);
    const u = new SpeechSynthesisUtterance(clean); u.rate = 1.05; u.pitch = 1; u.volume = 0.9;
    const voices = speechSynthesis.getVoices();
    const pref = voices.find(v => v.name.includes("Google") && v.lang.startsWith("en")) || voices.find(v => v.lang.startsWith("en"));
    if (pref) u.voice = pref;
    speechSynthesis.speak(u);
  };

  const toggleListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice not supported"); return; }
    if (isListening && recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); return; }
    const r = new SR(); r.continuous = false; r.interimResults = true; r.lang = "en-US";
    r.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
      setInput(transcript);
      if (e.results[0].isFinal) setTimeout(() => send(transcript), 300);
    };
    r.onerror = () => setIsListening(false); r.onend = () => setIsListening(false);
    recognitionRef.current = r; r.start(); setIsListening(true);
  };

  const clearChat = () => {
    setMsgs([{ role: "assistant", content: "Chat cleared. How can I help you?", ts: new Date().toISOString() }]);
    if ("speechSynthesis" in window) speechSynthesis.cancel();
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target; el.style.height = "auto";
    const maxH = 4 * 22;
    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
  };

  const formatMessage = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, i) => {
      const parts = []; let remaining = line; let keyIdx = 0;
      while (remaining.includes("**")) {
        const start = remaining.indexOf("**");
        if (start > 0) parts.push(<span key={keyIdx++}>{remaining.slice(0, start)}</span>);
        remaining = remaining.slice(start + 2);
        const end = remaining.indexOf("**");
        if (end === -1) { parts.push(<span key={keyIdx++}>**{remaining}</span>); remaining = ""; break; }
        parts.push(<strong key={keyIdx++} style={{ fontWeight: 700 }}>{remaining.slice(0, end)}</strong>);
        remaining = remaining.slice(end + 2);
      }
      if (remaining) parts.push(<span key={keyIdx++}>{remaining}</span>);
      const isBullet = /^[\s]*[-•]\s+/.test(line);
      const isNumbered = /^[\s]*\d+\.\s+/.test(line);
      if (isBullet) { const content = line.replace(/^[\s]*[-•]\s+/, ""); return <div key={i} style={{ display: "flex", gap: 8, paddingLeft: 4, marginTop: 2 }}><span style={{ color: C.ac, flexShrink: 0 }}>&#8226;</span><span>{parts.length > 1 ? parts : content}</span></div>; }
      if (isNumbered) return <div key={i} style={{ paddingLeft: 4, marginTop: 2 }}>{parts.length > 1 ? parts : line}</div>;
      if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
      return <div key={i}>{parts.length > 1 ? parts : line}</div>;
    });
  };

  // ── GATHER ALL APP DATA ────────────────────────────────────────────────
  const gatherContext = async () => {
    let ctx = "";
    try {
      const c = await api.get("/clients"); const cl = unwrap(c, "clients");
      ctx += `\n\nCLIENTS (${cl.length} total):`;
      cl.slice(0, 25).forEach(x => { ctx += `\n- ${cName(x)} | Email: ${cEmail(x)} | Phone: ${cPhone(x) || "not set"} | Type: ${x.sessionType || "offline"} | ID: ${x.id}`; });
    } catch { ctx += "\n\nCLIENTS: Could not fetch"; }

    try {
      const b = await api.get("/bookings"); const bk = unwrap(b, "bookings", "sessions");
      const today = new Date().toISOString().slice(0, 10);
      const todayBk = bk.filter(x => { try { return new Date(x.date || x.startTime || x.scheduledAt).toISOString().slice(0, 10) === today; } catch { return false; } });
      const upcoming = bk.filter(x => { try { return new Date(x.date || x.startTime || x.scheduledAt) >= new Date(); } catch { return false; } }).sort((a, b) => new Date(a.date || a.startTime) - new Date(b.date || b.startTime)).slice(0, 10);
      ctx += `\n\nTODAY'S SCHEDULE (${today}, ${todayBk.length} sessions):`;
      todayBk.forEach(x => { const t = new Date(x.date || x.startTime || x.scheduledAt); ctx += `\n- ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} | ${cName(x.client) || x.type || "Session"} | ${x.duration || 60}min | Status: ${x.status || "pending"} | ID: ${x.id}`; });
      if (todayBk.length === 0) ctx += "\n- No sessions scheduled today";
      ctx += `\n\nUPCOMING SESSIONS (next ${upcoming.length}):`;
      upcoming.slice(0, 5).forEach(x => { const t = new Date(x.date || x.startTime || x.scheduledAt); ctx += `\n- ${t.toLocaleDateString()} ${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} | ${cName(x.client) || x.type || "Session"} | ID: ${x.id}`; });
    } catch { ctx += "\n\nBOOKINGS: Could not fetch"; }

    try {
      const r = await api.get("/reports/coach/dashboard"); const d = r?.data || r || {};
      ctx += `\n\nBUSINESS STATS:`;
      ctx += `\n- Active clients: ${d.activeClients || d.totalClients || 0}`;
      ctx += `\n- Total revenue: ₹${(d.totalRevenue || d.monthlyRevenue || 0).toLocaleString()}`;
      ctx += `\n- Upcoming bookings: ${d.upcomingBookings || 0}`;
      ctx += `\n- Conversion rate: ${d.conversionRate || 0}%`;
      ctx += `\n- Retention rate: ${d.retentionRate || 0}%`;
    } catch {}

    try {
      const l = await api.get("/leads"); const ld = unwrap(l, "leads");
      ctx += `\n\nLEADS (${ld.length}):`;
      ld.slice(0, 10).forEach(x => ctx += `\n- ${x.name} [${x.status || "new"}] ${x.email || ""}`);
    } catch {}

    const holidays = ls.get("holidays", []);
    if (holidays.length) ctx += `\n\nHOLIDAYS: ${holidays.join(", ")}`;
    const checkins = ls.get("checkins", []);
    if (checkins.length) { const last = checkins[checkins.length - 1]; ctx += `\n\nLATEST CHECK-IN (${last.date}): Energy ${last.energy}/10, Sleep ${last.sleep}/10, Stress ${last.stress}/10, Adherence ${last.adherence}%, Mood: ${last.mood}`; }

    return ctx;
  };

  // ── EXECUTE REAL ACTIONS ───────────────────────────────────────────────
  const executeAction = async (userMsg) => {
    const msg = userMsg.toLowerCase();
    const results = [];

    const addClientMatch = msg.match(/(?:add|create|new)\s+(?:a\s+)?client\s+(?:named?\s+)?([a-zA-Z\s]+?)(?:\s*,\s*|\s+(?:phone|mobile|number|email|with)|\s*$)/i);
    if (addClientMatch) {
      const name = addClientMatch[1].trim().replace(/\s+phone.*$/i, "").replace(/\s+email.*$/i, "").trim();
      if (name.length >= 2) {
        const phoneMatch = userMsg.match(/(?:phone|mobile|number|ph|mob)[:\s]*(\+?\d[\d\s\-]{6,})/i) || userMsg.match(/(\d{10,})/);
        const emailMatch = userMsg.match(/(?:email)[:\s]*([^\s,]+@[^\s,]+)/i);
        const phone = phoneMatch ? phoneMatch[1].replace(/[\s\-]/g, "") : "";
        const email = emailMatch ? emailMatch[1] : `${name.toLowerCase().replace(/\s+/g, ".")}@client.com`;
        const sessionType = msg.includes("online") ? "online" : msg.includes("hybrid") ? "hybrid" : "offline";
        try {
          const r = await api.post("/clients", { name, email, phone, sessionType });
          const created = r?.client || r;
          results.push(`**Client added!**\n- **Name:** ${cName(created) || name}\n- **Email:** ${email}\n- **Phone:** ${phone || "not set"}\n- **Type:** ${sessionType}`);
        } catch (e) { results.push(`Could not add client "${name}": ${e.message}`); }
      }
    }

    if (msg.match(/(?:show|list|how many|my)\s*(?:all\s+)?clients|client\s*list|number of clients/i) && !addClientMatch) {
      try {
        const c = await api.get("/clients"); const cl = unwrap(c, "clients");
        let txt = `**${cl.length} Client(s):**\n`;
        cl.forEach((x, i) => { txt += `\n${i + 1}. **${cName(x)}** — ${cEmail(x)}${cPhone(x) ? ` — ${cPhone(x)}` : ""} — ${x.sessionType || "offline"}`; });
        results.push(txt);
      } catch (e) { results.push("Could not fetch clients: " + e.message); }
    }

    if (msg.match(/(?:show|what|my|today|tomorrow)\s*(?:'?s?\s*)?(?:schedule|sessions?|bookings?|calendar)/i) || msg.match(/schedule\s+(?:for\s+)?(?:today|tomorrow|this week)/i)) {
      try {
        const b = await api.get("/bookings"); const bk = unwrap(b, "bookings", "sessions");
        const isTomorrow = msg.includes("tomorrow");
        const targetDate = new Date();
        if (isTomorrow) targetDate.setDate(targetDate.getDate() + 1);
        const dateStr = targetDate.toISOString().slice(0, 10);
        const dayName = targetDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
        const dayBk = bk.filter(x => { try { return new Date(x.date || x.startTime || x.scheduledAt).toISOString().slice(0, 10) === dateStr; } catch { return false; } }).sort((a, b) => new Date(a.date || a.startTime) - new Date(b.date || b.startTime));
        let txt = `**Schedule for ${dayName}** (${dayBk.length} session${dayBk.length !== 1 ? "s" : ""}):\n`;
        if (dayBk.length === 0) txt += "\nNo sessions scheduled. Your day is free!";
        else dayBk.forEach((x, i) => { const t = new Date(x.date || x.startTime || x.scheduledAt); txt += `\n${i + 1}. **${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}** — ${cName(x.client) || x.type || "Session"} (${x.duration || 60}min) [${x.status || "pending"}]`; });
        results.push(txt);
      } catch (e) { results.push("Could not fetch schedule: " + e.message); }
    }

    const bookMatch = msg.match(/book\s+(?:a\s+)?(?:session\s+)?(?:for\s+)?([a-zA-Z]+)\s+(?:on\s+)?(?:(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s*(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i);
    if (bookMatch) {
      const clientName = bookMatch[1]; const dayWord = bookMatch[2].toLowerCase(); const timeStr = bookMatch[3] || "09:00";
      let clients2 = [];
      try { const c = await api.get("/clients"); clients2 = unwrap(c, "clients"); } catch {}
      const matchedClient = clients2.find(c => cName(c).toLowerCase().includes(clientName.toLowerCase()));
      if (!matchedClient) { results.push(`Could not find a client matching "**${clientName}**". Please add them first or check the name.`); }
      else {
        let bookDate = new Date();
        if (dayWord === "tomorrow") bookDate.setDate(bookDate.getDate() + 1);
        else if (dayWord !== "today") { const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]; const targetDay = days.indexOf(dayWord); if (targetDay >= 0) { const current = bookDate.getDay(); const diff = (targetDay - current + 7) % 7 || 7; bookDate.setDate(bookDate.getDate() + diff); } }
        let hours = 9, minutes = 0;
        const timeParsed = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
        if (timeParsed) { hours = parseInt(timeParsed[1]); minutes = parseInt(timeParsed[2] || "0"); if (timeParsed[3]?.toLowerCase() === "pm" && hours < 12) hours += 12; if (timeParsed[3]?.toLowerCase() === "am" && hours === 12) hours = 0; }
        const localDate = new Date(bookDate.getFullYear(), bookDate.getMonth(), bookDate.getDate(), hours, minutes);
        const scheduledAt = localDate.toISOString();
        try {
          let coachId; try { const me = await api.get("/auth/me"); coachId = me?.profile?.id; } catch {}
          await api.post("/bookings", { clientId: matchedClient.id, coachId, scheduledAt, date: scheduledAt, durationMinutes: 60, duration: 60, sessionType: "training", type: "training", status: "confirmed" });
          results.push(`**Session booked!**\n- **Client:** ${cName(matchedClient)}\n- **Date:** ${bookDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}\n- **Time:** ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}\n- **Duration:** 60min\n- **Status:** Confirmed`);
        } catch (e) { results.push(`Could not book session: ${e.message}`); }
      }
    }

    if (msg.match(/revenue|earnings|income|how much.*(?:made|earned)|stats|business|overview|dashboard/i) && !addClientMatch && !bookMatch) {
      try { const r = await api.get("/reports/coach/dashboard"); const d = r?.data || r || {}; results.push(`**Business Overview:**\n\n- **Revenue:** ₹${(d.totalRevenue || d.monthlyRevenue || 0).toLocaleString()}\n- **Active Clients:** ${d.activeClients || d.totalClients || 0}\n- **Upcoming Sessions:** ${d.upcomingBookings || 0}\n- **Conversion Rate:** ${d.conversionRate || 0}%\n- **Retention Rate:** ${d.retentionRate || 0}%`); } catch { results.push("Could not fetch business stats"); }
    }

    if (msg.match(/(?:create|make|generate|build)\s+(?:a\s+)?(?:workout|exercise|training)\s*(?:plan)?/i)) {
      const isPush = msg.includes("push"); const isPull = msg.includes("pull"); const isLegs = msg.includes("leg");
      const isFull = msg.includes("full body");
      let title = "Custom Workout"; let exercises = [];
      if (isPush) { title = "Push Day"; exercises = [{ name: "Bench Press", sets: 4, reps: 8 }, { name: "Overhead Press", sets: 3, reps: 10 }, { name: "Incline DB Press", sets: 3, reps: 10 }, { name: "Lateral Raise", sets: 3, reps: 15 }, { name: "Tricep Pushdown", sets: 3, reps: 12 }, { name: "Cable Fly", sets: 3, reps: 12 }]; }
      else if (isPull) { title = "Pull Day"; exercises = [{ name: "Deadlift", sets: 4, reps: 6 }, { name: "Barbell Row", sets: 4, reps: 8 }, { name: "Lat Pulldown", sets: 3, reps: 10 }, { name: "Face Pull", sets: 3, reps: 15 }, { name: "Dumbbell Curl", sets: 3, reps: 12 }, { name: "Hammer Curl", sets: 3, reps: 12 }]; }
      else if (isLegs) { title = "Leg Day"; exercises = [{ name: "Barbell Squat", sets: 4, reps: 8 }, { name: "Romanian Deadlift", sets: 3, reps: 10 }, { name: "Leg Press", sets: 3, reps: 12 }, { name: "Leg Curl", sets: 3, reps: 12 }, { name: "Bulgarian Split Squat", sets: 3, reps: 10 }, { name: "Calf Raise", sets: 4, reps: 15 }]; }
      else if (isFull) { title = "Full Body"; exercises = [{ name: "Barbell Squat", sets: 3, reps: 8 }, { name: "Bench Press", sets: 3, reps: 8 }, { name: "Barbell Row", sets: 3, reps: 8 }, { name: "Overhead Press", sets: 3, reps: 10 }, { name: "Romanian Deadlift", sets: 3, reps: 10 }, { name: "Pull-ups", sets: 3, reps: 8 }]; }
      else { title = "General Strength"; exercises = [{ name: "Barbell Squat", sets: 3, reps: 10 }, { name: "Bench Press", sets: 3, reps: 10 }, { name: "Barbell Row", sets: 3, reps: 10 }, { name: "Overhead Press", sets: 3, reps: 10 }, { name: "Deadlift", sets: 3, reps: 8 }]; }
      const plan = { id: `workout_${Date.now()}`, title, description: "Created by AI Coach", exercises, status: "active", createdAt: new Date().toISOString() };
      try { await api.post("/workouts/plans", { name: title, description: "Created by AI Coach", exercises, intensity: "moderate", durationWeeks: 4 }); } catch { const localW = ls.get("local_workouts", []); localW.push(plan); ls.set("local_workouts", localW); }
      let txt = `**Workout Created: ${title}**\n`;
      exercises.forEach((e, i) => { txt += `\n${i + 1}. **${e.name}** — ${e.sets}x${e.reps}`; });
      txt += `\n\nSaved! View it in the Workouts tab.`;
      results.push(txt);
    }

    if (msg.match(/cancel\s+(?:all\s+)?(?:sessions?|bookings?)\s+(?:on\s+|for\s+)?(?:today|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday)/i)) {
      const dayMatch = msg.match(/(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
      if (dayMatch) {
        let targetDate = new Date(); const dayWord = dayMatch[1].toLowerCase();
        if (dayWord === "tomorrow") targetDate.setDate(targetDate.getDate() + 1);
        else if (dayWord !== "today") { const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]; const targetDay = days.indexOf(dayWord); if (targetDay >= 0) { const diff = (targetDay - targetDate.getDay() + 7) % 7 || 7; targetDate.setDate(targetDate.getDate() + diff); } }
        const dateStr = targetDate.toISOString().slice(0, 10);
        let count = 0;
        try {
          const b = await api.get("/bookings"); const bk = unwrap(b, "bookings", "sessions");
          const dayBk = bk.filter(x => { try { const st = (x.status || "").toUpperCase(); return new Date(x.date || x.startTime || x.scheduledAt).toISOString().slice(0, 10) === dateStr && st !== "CANCELLED"; } catch { return false; } });
          for (const booking of dayBk) { try { await api.req(`/bookings/${booking.id}`, { method: "PATCH", body: JSON.stringify({ status: "CANCELLED" }) }); count++; } catch {} }
        } catch {}
        const holidays = ls.get("holidays", []);
        if (!holidays.includes(dateStr)) { ls.set("holidays", [...holidays, dateStr]); }
        results.push(`**${count} session(s) cancelled** for ${targetDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}.\nDay marked as holiday.`);
      }
    }

    const deleteMatch = msg.match(/(?:delete|remove)\s+client\s+([a-zA-Z\s]+?)(?:\s*$|\s*,)/i);
    if (deleteMatch) {
      const name = deleteMatch[1].trim();
      try {
        const c = await api.get("/clients"); const cl = unwrap(c, "clients");
        const match = cl.find(x => cName(x).toLowerCase().includes(name.toLowerCase()));
        if (match) { try { await api.del(`/clients/${match.id}`); results.push(`**Client "${cName(match)}" deleted.**`); } catch (e) { results.push(`Could not delete: ${e.message}`); } }
        else { results.push(`No client found matching "**${name}**"`); }
      } catch { results.push("Could not fetch clients"); }
    }

    const findMatch = msg.match(/(?:find|search|look up|who is)\s+(?:client\s+)?([a-zA-Z]+)/i);
    if (findMatch && !addClientMatch && !deleteMatch && !bookMatch) {
      const name = findMatch[1].trim();
      try {
        const c = await api.get("/clients"); const cl = unwrap(c, "clients");
        const matches = cl.filter(x => cName(x).toLowerCase().includes(name.toLowerCase()));
        if (matches.length > 0) { let txt = `**Found ${matches.length} match(es) for "${name}":**\n`; matches.forEach(x => { txt += `\n- **${cName(x)}** — ${cEmail(x)} — ${cPhone(x) || "no phone"} — ${x.sessionType || "offline"}`; }); results.push(txt); }
        else { results.push(`No clients found matching "**${name}**"`); }
      } catch { results.push("Could not search clients"); }
    }

    const editClientMatch = msg.match(/(?:edit|update|change|modify)\s+(?:client\s+)?([a-zA-Z]+?)(?:'?s?)?\s+(?:phone|mobile|number|email|name|session\s*type|type|goals?)/i);
    if (editClientMatch && !addClientMatch && !deleteMatch) {
      const name = editClientMatch[1].trim();
      try {
        const c = await api.get("/clients"); const cl = unwrap(c, "clients");
        const match = cl.find(x => cName(x).toLowerCase().includes(name.toLowerCase()));
        if (match) {
          const updateData = {};
          const phoneM = userMsg.match(/(?:phone|mobile|number)[:\s]+(\+?\d[\d\s\-]{6,})/i);
          const emailM = userMsg.match(/(?:email)[:\s]+([^\s,]+@[^\s,]+)/i);
          const nameM = userMsg.match(/(?:name\s+(?:to|as|=)\s+)([a-zA-Z\s]+?)(?:\s*,|\s*$)/i);
          const typeM = userMsg.match(/(?:type|session\s*type)\s+(?:to|as|=)\s+(online|offline|hybrid)/i);
          const goalsM = userMsg.match(/(?:goals?)\s+(?:to|as|=)\s+(.+?)(?:\s*,|\s*$)/i);
          if (phoneM) updateData.phone = phoneM[1].replace(/[\s\-]/g, "");
          if (emailM) updateData.email = emailM[1];
          if (nameM) updateData.displayName = nameM[1].trim();
          if (typeM) updateData.sessionType = typeM[1].toLowerCase();
          if (goalsM) updateData.goals = goalsM[1].trim();
          if (Object.keys(updateData).length > 0) { try { await api.put(`/clients/${match.id}`, updateData); results.push(`**Client "${cName(match)}" updated:**\n${Object.entries(updateData).map(([k, v]) => `- **${k}:** ${v}`).join("\n")}`); } catch (e) { results.push(`Could not update: ${e.message}`); } }
          else { results.push(`Found **${cName(match)}** but couldn't parse what to update. Try: "edit ${name} phone 9876543210" or "edit ${name} type online"`); }
        } else { results.push(`No client found matching "**${name}**"`); }
      } catch { results.push("Could not fetch clients"); }
    }

    const editWorkoutMatch = msg.match(/(?:edit|update|rename|modify)\s+(?:workout|plan)\s+(?:named?\s+)?["']?(.+?)["']?\s+(?:to|title|name|add|remove)/i);
    if (editWorkoutMatch) {
      const planName = editWorkoutMatch[1].trim();
      try {
        const w = await api.get("/workouts/plans").catch(() => null);
        const plans = w ? unwrap(w, "workouts", "plans") : [];
        const localPlans = ls.get("local_workouts", []);
        const allPlans = [...plans, ...localPlans];
        const match = allPlans.find(p => (p.title || p.name || "").toLowerCase().includes(planName.toLowerCase()));
        if (match) {
          const titleM = userMsg.match(/(?:title|name|rename)\s+(?:to|as|=)\s+["']?(.+?)["']?(?:\s*$|\s*,)/i);
          if (titleM) {
            if (String(match.id).startsWith("workout_")) { const local = ls.get("local_workouts", []).map(p => p.id === match.id ? { ...p, title: titleM[1].trim() } : p); ls.set("local_workouts", local); results.push(`**Workout renamed** to "${titleM[1].trim()}"`); }
            else { try { await api.put(`/workouts/plans/${match.id}`, { name: titleM[1].trim() }); results.push(`**Workout "${match.title || match.name}" renamed** to "${titleM[1].trim()}"`); } catch (e) { results.push(`Could not update: ${e.message}`); } }
          } else { results.push(`Found workout "**${match.title || match.name}**" but couldn't parse edit. Try: "rename workout X to Y"`); }
        } else { results.push(`No workout found matching "**${planName}**"`); }
      } catch { results.push("Could not search workouts"); }
    }

    return results;
  };

  // ── SEND MESSAGE ───────────────────────────────────────────────────────
  const send = async (text) => {
    const msg = (text || input).trim(); if (!msg || loading) return;
    if (!text) setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMsgs(p => [...p, { role: "user", content: msg, ts: new Date().toISOString() }]); setLoading(true);

    try {
      const actionResults = await executeAction(msg);
      const context = await gatherContext();
      const enrichedMessage = `[APP DATA CONTEXT — Coach's real-time data is below. Use it to answer questions precisely. You can also search the web for fitness research, new workout ideas, exercise form guides, nutrition plans, and trending fitness content.

APP DATA:${context}

${actionResults.length > 0 ? `\nACTIONS ALREADY EXECUTED:\n${actionResults.join("\n")}\n\nTell the user about these completed actions and ask if they need anything else.` : ""}
END CONTEXT]

User question: ${msg}`;
      const sysPrompt = `You are CoachMe AI — a world-class fitness coaching assistant with deep expertise in exercise science, nutrition, and coaching business. You have full access to the coach's real-time data. Answer precisely using actual data. Be concise, use bullet points. When the coach asks about new workouts, exercises, nutrition plans, videos, or fitness research — provide detailed, actionable answers drawing from your training knowledge. You can search the web for latest fitness research and trends when needed. Current date: ${new Date().toLocaleString()}. Coach: ${user?.name || "Coach"} (${user?.email}).`;
      const r = await api.post("/ai/chat", { system: sysPrompt, message: enrichedMessage, search: true });
      let reply = r.text || r.reply || r.message || r.response || "";
      const isGeneric = !reply || reply.length < 20 || reply.toLowerCase().includes("let me help") || reply.toLowerCase().includes("i'll help") || reply.toLowerCase().includes("i can help") || reply.toLowerCase().includes("sure, i");
      if (actionResults.length > 0) { reply = actionResults.join("\n\n") + (isGeneric ? "" : "\n\n" + reply); }
      else if (isGeneric) { reply = await generateLocalResponse(msg, context); }
      setMsgs(p => [...p, { role: "assistant", content: reply, ts: new Date().toISOString(), grounded: actionResults.length === 0 && !!r.grounded }]);
      speakText(reply);
    } catch (e) {
      const fallback = "I couldn't reach the AI service, but your app data is accessible. Try asking about your schedule, clients, or stats.";
      setMsgs(p => [...p, { role: "assistant", content: fallback, ts: new Date().toISOString() }]);
    }
    setLoading(false);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  // ── LOCAL RESPONSE GENERATOR (when AI gives generic answers) ───────────
  const generateLocalResponse = async (msg, context) => {
    const lower = msg.toLowerCase();
    if (lower.match(/schedule|session|booking|calendar|today|tomorrow/)) {
      try {
        const b = await api.get("/bookings"); const bk = unwrap(b, "bookings", "sessions");
        const today = new Date().toISOString().slice(0, 10);
        const todayBk = bk.filter(x => { try { return new Date(x.date || x.startTime || x.scheduledAt).toISOString().slice(0, 10) === today; } catch { return false; } });
        if (todayBk.length === 0) return "No sessions scheduled today. Your day is free!";
        let txt = `**Today's schedule** (${todayBk.length} session${todayBk.length > 1 ? "s" : ""}):\n`;
        todayBk.forEach((x, i) => { const t = new Date(x.date || x.startTime || x.scheduledAt); txt += `\n${i + 1}. **${t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}** — ${cName(x.client) || x.type || "Session"} (${x.duration || 60}min)`; });
        return txt;
      } catch {}
    }
    if (lower.match(/client|how many/)) {
      try { const c = await api.get("/clients"); const cl = unwrap(c, "clients"); return `**${cl.length} client(s):**${cl.length > 0 ? "\n" + cl.slice(0, 5).map((x, i) => `\n${i + 1}. **${cName(x)}** — ${cEmail(x)}`).join("") : ""}`; } catch {}
    }
    if (lower.match(/revenue|money|earned|income|stats|business/)) {
      try { const r = await api.get("/reports/coach/dashboard"); const d = r?.data || r || {}; return `**Business Stats:**\n\n- **Revenue:** ₹${(d.totalRevenue || d.monthlyRevenue || 0).toLocaleString()}\n- **Clients:** ${d.activeClients || d.totalClients || 0}\n- **Upcoming:** ${d.upcomingBookings || 0} sessions\n- **Conversion:** ${d.conversionRate || 0}%`; } catch {}
    }
    if (lower.match(/lead/)) {
      try { const l = await api.get("/leads"); const ld = unwrap(l, "leads"); return `**${ld.length} lead(s):**\n\n${ld.slice(0, 10).map((x, i) => `${i + 1}. **${x.name}** — [${x.status || "new"}]`).join("\n")}`; } catch {}
    }
    return "I processed your request. Try asking about:\n- Your schedule (\"show today's sessions\")\n- Clients (\"list my clients\")\n- Revenue (\"show my stats\")\n- Add data (\"add client Ravi, phone 98765\")\n- Workouts (\"create a push day workout\")\n- Bookings (\"book session for Priya tomorrow 7am\")";
  };

  const suggestions = ["Show today's schedule", "List my clients", "Best exercises for fat loss", "Create a push workout", "Suggest a nutrition plan", "Edit client phone number", "New HIIT workout ideas", "What's my revenue?"];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 120px)", maxHeight: "calc(100dvh - 120px)", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 10, flexShrink: 0, borderBottom: `1px solid ${C.bd}`, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#fff", fontWeight: 700 }}>AI</div>
          <div><h2 style={{ color: C.tx, fontSize: 17, fontWeight: 700, margin: 0 }}>CoachMe AI</h2><div style={{ fontSize: 11, color: C.ok, fontWeight: 500 }}>Online</div></div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={clearChat} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: C.s2, color: C.mt }} title="Clear chat">Clear</button>
          <button onClick={() => { setVoiceOn(!voiceOn); if (voiceOn) speechSynthesis.cancel(); }} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: voiceOn ? C.ok + "20" : C.s2, color: voiceOn ? C.ok : C.mt }}>{voiceOn ? "Sound On" : "Sound Off"}</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 2 }}>
            <div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: 18, borderBottomRightRadius: m.role === "user" ? 4 : 18, borderBottomLeftRadius: m.role === "user" ? 18 : 4, background: m.role === "user" ? C.ac : C.s2, color: m.role === "user" ? "#fff" : C.tx, fontSize: 14, lineHeight: 1.6 }}>
              {m.role === "assistant" ? formatMessage(m.content) : <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span>}
              {m.grounded && <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.a2 + "18", color: C.a2, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, marginTop: 8 }}>📊 Grounded in your actual client &amp; lead data</div>}
            </div>
            <span style={{ fontSize: 10, color: C.mt, padding: "0 4px" }}>{m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
          </div>
        ))}
        {loading && <div style={{ alignSelf: "flex-start", padding: "12px 20px", borderRadius: 18, background: C.s2 }}><div style={{ display: "flex", gap: 5, alignItems: "center" }}>{[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: C.mt, animation: `pulse 1.4s ease-in-out ${i * .15}s infinite`, opacity: .7 }} />)}</div></div>}
        <div ref={br} />
      </div>

      {!loading && user?.role === "COACH" && msgs.length === 1 && <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8, flexShrink: 0 }}>
        {["Who needs attention?", "How's this month looking?", "Which leads should I prioritize?", "Best time to add a client?"].map(q => <button key={q} onClick={() => send(q)} style={{ flexShrink: 0, background: C.s2, border: `1px solid ${C.bd}`, color: C.tx, fontSize: 12, fontWeight: 600, padding: "8px 13px", borderRadius: 20, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit" }}>{q}</button>)}
      </div>}

      {!loading && msgs.length > 0 && msgs[msgs.length - 1].role === "assistant" && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, paddingBottom: 8, flexShrink: 0 }}>
        {suggestions.map(s => <button key={s} onClick={() => send(s)} style={{ padding: "10px 12px", borderRadius: 14, border: `1px solid ${C.bd}`, background: C.s2, color: C.tx, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all .15s", lineHeight: 1.3 }}>{s}</button>)}
      </div>}

      <div style={{ display: "flex", gap: 8, flexShrink: 0, paddingTop: 8, alignItems: "flex-end" }}>
        <button onClick={toggleListening} style={{ width: 44, height: 44, borderRadius: 22, cursor: "pointer", background: isListening ? C.dg : "transparent", border: isListening ? "none" : `2px solid ${C.bd}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: isListening ? `0 0 16px ${C.dg}40` : "none", animation: isListening ? "pulse 1s infinite" : "none", transition: "all .2s", color: isListening ? "#fff" : C.mt }}>{isListening ? "..." : "Mic"}</button>
        <div style={{ flex: 1, position: "relative" }}>
          <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={isListening ? "Listening..." : "Message CoachMe AI..."} rows={1} style={{ width: "100%", background: C.s2, border: `2px solid ${isListening ? C.dg : C.bd}`, borderRadius: 22, padding: "11px 16px", color: C.tx, fontSize: 14, outline: "none", fontFamily: "inherit", resize: "none", lineHeight: "22px", maxHeight: 4 * 22, overflow: "auto", boxSizing: "border-box", transition: "border-color .2s" }} />
        </div>
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{ width: 44, height: 44, borderRadius: 22, border: "none", cursor: loading || !input.trim() ? "default" : "pointer", background: input.trim() ? C.gr : C.s2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: input.trim() ? "#fff" : C.mt, flexShrink: 0, transition: "all .2s", opacity: loading ? .5 : 1 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
        </button>
      </div>
    </div>
  );
}
