// ═══════════════════════════════════════════════════════════════════════
// LIVE SESSION — records a session via speech recognition (Hindi/English/
// Hinglish), sends the transcript to Claude for structured exercise
// extraction, then lets the coach review/edit before saving attendance
// + logged workout sessions. Supports both 1:1 and group sessions.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { cName } from "../lib/utils.js";
import { Card, Badge, Btn, Input, TextArea, Spin } from "../components/ui.jsx";

export default function LiveSessionPage({ booking, clients, onBack, onComplete }) {
  const bookings = Array.isArray(booking) ? booking : [booking];
  const isGroup = bookings.length > 1;
  const [phase, setPhase] = useState("recording"); // recording -> processing -> review -> done
  const [transcript, setTranscript] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [timer, setTimer] = useState(0);
  const [exercises, setExercises] = useState([]);
  const [comparisons, setComparisons] = useState({}); // exerciseName -> comparison result, 1:1 sessions only

  // "vs last time" comparison — deterministic math (see backend
  // exerciseTrendService.js for why this isn't a second AI call), fetched
  // once per exercise as soon as the review screen has something to show.
  // Deliberately 1:1 only — in a group session, exercises are shared
  // across multiple clients and "whose progress" would be ambiguous to
  // show in one shared review screen.
  useEffect(() => {
    if (phase !== "review" || isGroup || exercises.length === 0) return;
    const clientId = bookings[0].clientId || bookings[0].client?.id;
    if (!clientId) return;
    exercises.forEach((ex) => {
      if (!ex.name.trim() || comparisons[ex.name]) return;
      api.post(`/exercise-trends/${clientId}/${encodeURIComponent(ex.name)}/compare`, { completedAt: new Date().toISOString(), intensity: ex.weight, reps: parseInt(ex.reps) || null })
        .then((r) => setComparisons((prev) => ({ ...prev, [ex.name]: r })))
        .catch(() => {}); // non-fatal — comparison is a nice-to-have, never blocks saving
    });
  }, [phase, exercises]);
  const [sessionNotes, setSessionNotes] = useState("");
  const [attendance, setAttendance] = useState(() => {
    const att = {}; bookings.forEach(b => { att[b.id] = true; }); return att;
  });
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [lang, setLang] = useState("hi-IN");
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const wakeLockRef = useRef(null);
  const finalTranscriptRef = useRef("");

  const getClientName = (b) => cName(b.client) || clients?.find(c => c.id === b.clientId)?.displayName || "Client";
  const clientName = isGroup ? `Group (${bookings.length} clients)` : getClientName(bookings[0]);

  useEffect(() => {
    if (phase === "recording") { timerRef.current = setInterval(() => setTimer(t => t + 1), 1000); return () => clearInterval(timerRef.current); }
    if (timerRef.current) clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (phase === "recording" && navigator.wakeLock) { navigator.wakeLock.request("screen").then(wl => { wakeLockRef.current = wl; }).catch(() => {}); }
    return () => { if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; } };
  }, [phase]);

  useEffect(() => {
    if (phase !== "recording") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = lang; recognition.maxAlternatives = 3;
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          const best = result[0].transcript;
          const alts = [];
          for (let a = 1; a < result.length; a++) { if (result[a].transcript !== best) alts.push(result[a].transcript); }
          finalTranscriptRef.current += best + (alts.length ? ` [alt: ${alts.join(" | ")}] ` : " ");
        } else { interim += result[0].transcript; }
      }
      setTranscript(finalTranscriptRef.current + interim);
    };
    recognition.onend = () => { if (phase === "recording") try { recognition.start(); } catch {} };
    recognition.onerror = () => { if (phase === "recording") setTimeout(() => { try { recognition.start(); } catch {} }, 1000); };
    try { recognition.start(); } catch {}
    recognitionRef.current = recognition;
    return () => { try { recognition.stop(); } catch {} };
  }, [phase, lang]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const endRecording = async () => {
    if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
    setPhase("processing");
    const fullText = (transcript + "\n" + manualNotes).trim();
    if (!fullText) {
      setError("No transcript captured. Please add notes manually.");
      setExercises([{ name: "", sets: 3, reps: 10, weight: "", notes: "" }]);
      setPhase("review"); return;
    }
    try {
      const systemPrompt = `You are an expert fitness session transcript parser for Indian gym coaches. Your job is to extract structured exercise data from noisy, multilingual voice transcripts.

KEY RULES:
1. The transcript is from a LIVE gym session. It will be messy — speech recognition errors, multiple speakers, background noise artifacts.
2. The COACH is the person GIVING instructions (exercises, sets, reps, weights). IGNORE everything else — client questions, acknowledgments ("ok", "haan", "theek hai"), small talk, greetings, rest period chatter.
3. The transcript may be in Hindi, English, Hinglish (code-switching mid-sentence), or Hindi written in English script (transliterated). Handle ALL of these.
4. Exercise names should ALWAYS be output in standard English (e.g. "Bench Press" not "bench press karo").
5. Be AGGRESSIVE about finding exercises — even partial or garbled mentions. If you see something that looks like an exercise name near numbers, extract it.

HINDI NUMBER WORDS TO RECOGNIZE:
ek/एक=1, do/दो=2, teen/तीन=3, chaar/चार=4, paanch/पांच=5, chhe/छह=6, saat/सात=7, aath/आठ=8, nau/नौ=9, das/दस=10, baara/बारा=12, pandrah/पंद्रह=15, bees/बीस=20, pachees/पच्चीस=25, tees/तीस=30, saath/साठ=60, assi/अस्सी=80, sau/सौ=100

COMMON HINDI GYM VOCABULARY:
karo/करो = do it, lagao/लगाओ = apply/do, set/सेट = set, baar/बार = reps/times, uthao/उठाओ = lift, daalo/डालो = put/add, weight/वज़न = weight, kg/kilo/किलो = kilograms, dumbbell/डम्बल, barbell/बारबेल, machine/मशीन, plate/प्लेट, aur/और = more/and, next/अगला, rest/आराम = rest, badha/बढ़ा = increase, kam/कम = reduce

EXAMPLES OF REAL TRANSCRIPTS AND EXPECTED PARSING:
- "bench press karo teen set das das rep 60 kilo" -> Bench Press, 3 sets, 10 reps, 60kg
- "अब squats लगाओ 4 set 12 rep 80 kg" -> Squats, 4 sets, 12 reps, 80kg
- "ok next exercise shoulder press hai 3 sets of 15 at 20 kg" -> Shoulder Press, 3 sets, 15 reps, 20kg
- "bicep curl karo 3 set 15 baar 10 kg dumbbell se" -> Bicep Curl, 3 sets, 15 reps, 10kg
- "lat pulldown do set chaar rep baara 40 kilo" -> Lat Pulldown, 4 sets, 12 reps, 40kg
- "ab deadlift lagao teen set aath rep sau kilo" -> Deadlift, 3 sets, 8 reps, 100kg
- "plank karo 3 set 30 second" -> Plank, 3 sets, 30 reps, notes: "30 seconds hold"
- "leg press pe 4 set 15 rep" -> Leg Press, 4 sets, 15 reps (no weight mentioned)
- "push ups maar do teen set bees bees" -> Push Ups, 3 sets, 20 reps
- "cable fly karo 3 set 12 rep 15 kg" -> Cable Fly, 3 sets, 12 reps, 15kg

GARBLED/NOISY EXAMPLES (speech recognition errors):
- "bench breast 3 said 10 rap 60 key" -> likely "Bench Press, 3 sets, 10 reps, 60kg"
- "should a press kar lo" -> likely "Shoulder Press"
- "dead lift laga of 3 set at reps" -> likely "Deadlift, 3 sets, 8 reps"

When a number appears repeated like "das das" or "10 10", it usually means that many reps per set.
When weight is not mentioned, leave weight as empty string.
When sets/reps are ambiguous, use common gym defaults (3 sets, 10-12 reps).

Return ONLY valid JSON. No markdown, no backticks, no explanation.`;

      const clientList = bookings.map(b => getClientName(b)).join(", ");
      const userMsg = `Parse this coaching session transcript. Session type: ${bookings[0].sessionType || "training"}, ${isGroup ? `GROUP SESSION with clients: ${clientList}` : `Client: ${clientName}`}, Duration: ${formatTime(timer)}

TRANSCRIPT:
"""
${fullText}
"""

Return this exact JSON structure:
{"exercises":[{"name":"Exercise Name","sets":3,"reps":10,"weight":"60kg","notes":"","formNotes":""}],"sessionNotes":"Brief session summary in English"}

For "formNotes" specifically: listen for anything the coach says about HOW the exercise was performed, not just the numbers — form corrections, effort/struggle cues, or praise. Examples:
- "watch your back on that last set" -> formNotes: "Coach flagged back position on the last set"
- "bahut accha form tha" / "great form on those" -> formNotes: "Good form noted by coach"
- "struggled with the last two reps" -> formNotes: "Struggled on the final reps"
- Nothing said about form/quality for that exercise -> formNotes: "" (empty string, not a guess)`;

      const r = await api.post("/ai/chat", { system: systemPrompt, message: userMsg });
      const reply = r.text || r.reply || r.message || r.response || "";
      let parsed;
      try {
        const cleaned = reply.replace(/```json|```/g, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
      } catch { parsed = { exercises: [], sessionNotes: reply.slice(0, 200) }; }
      setExercises((parsed.exercises || []).map(ex => ({ name: ex.name || "", sets: ex.sets || 3, reps: ex.reps || 10, weight: ex.weight || "", notes: ex.notes || "", formNotes: ex.formNotes || "", formScore: null })));
      if (parsed.sessionNotes) setSessionNotes(parsed.sessionNotes);
    } catch (e) {
      setError("AI extraction failed: " + e.message + ". You can add exercises manually.");
      setExercises([{ name: "", sets: 3, reps: 10, weight: "", notes: "" }]);
    }
    setPhase("review");
  };

  const addExercise = () => setExercises([...exercises, { name: "", sets: 3, reps: 10, weight: "", notes: "", formNotes: "", formScore: null }]);
  const removeExercise = (i) => setExercises(exercises.filter((_, j) => j !== i));
  const updateExercise = (i, field, value) => setExercises(exercises.map((ex, j) => j === i ? { ...ex, [field]: value } : ex));

  const saveSession = async () => {
    setPhase("done");
    try {
      const fullTranscript = (transcript + (manualNotes ? "\n\nManual Notes:\n" + manualNotes : "")).trim();
      const notesText = (fullTranscript ? "Session Transcript:\n" + fullTranscript + "\n\n" : "") + (sessionNotes ? "AI Summary:\n" + sessionNotes : "");
      for (const b of bookings) {
        await api.req(`/bookings/${b.id}`, { method: "PATCH", body: JSON.stringify({ status: attendance[b.id] ? "COMPLETED" : "ABSENT", notes: notesText }) });
      }
      const validExercises = exercises.filter(ex => ex.name.trim());
      const attendingBookings = bookings.filter(b => attendance[b.id]);
      for (const b of attendingBookings) {
        for (const ex of validExercises) {
          // formScore/formNotes confirmed accepted directly by POST /workouts/sessions
          // (verified against the real backend) — no separate follow-up call needed.
          await api.post("/workouts/sessions", { clientId: b.clientId || b.client?.id, exerciseName: ex.name, sets: parseInt(ex.sets) || 0, reps: parseInt(ex.reps) || 0, intensity: ex.weight || null, durationSeconds: timer, notes: ex.notes || null, formScore: ex.formScore || null, formNotes: ex.formNotes || null });
        }
      }
      onComplete?.();
    } catch (e) { setError("Save failed: " + e.message); setPhase("review"); }
  };

  if (phase === "recording") return (
    <div style={{ minHeight: "100dvh", background: C.bg, padding: 20, display: "flex", flexDirection: "column" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}><div style={{ fontSize: 12, color: C.mt, marginBottom: 4 }}>LIVE SESSION</div><div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>{clientName}</div></div>
      <Card style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: C.ac, fontVariantNumeric: "tabular-nums" }}>{formatTime(timer)}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8 }}><div style={{ width: 10, height: 10, borderRadius: 5, background: C.dg, animation: "pulse 1.5s ease infinite" }} /><span style={{ fontSize: 13, color: C.dg, fontWeight: 600 }}>Recording</span></div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10 }}>
          {[{ code: "hi-IN", label: "हिं Hindi" }, { code: "en-IN", label: "EN English" }].map(l => <button key={l.code} onClick={() => { setLang(l.code); if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch {} } }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: lang === l.code ? C.ac + "30" : C.s2, color: lang === l.code ? C.ac : C.mt }}>{l.label}</button>)}
        </div>
      </Card>
      <Card style={{ flex: 1, marginBottom: 16, overflow: "auto", maxHeight: 200 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.mt, marginBottom: 8 }}>Live Transcript</div>
        <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.6, minHeight: 60 }}>{transcript || <span style={{ color: C.mt, fontStyle: "italic" }}>Listening... speak naturally during the session</span>}</div>
      </Card>
      <TextArea label="Manual Notes (optional)" value={manualNotes} onChange={e => setManualNotes(e.target.value)} placeholder="Type extra notes here..." style={{ marginBottom: 16 }} />
      <div style={{ display: "flex", gap: 8 }}><Btn variant="secondary" onClick={onBack} style={{ flex: 1 }}>Cancel</Btn><Btn variant="danger" onClick={endRecording} style={{ flex: 2, background: C.dg, color: "#fff" }}>End Session</Btn></div>
    </div>
  );

  if (phase === "processing") return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20, padding: 20 }}>
      <Spin /><div style={{ color: C.tx, fontSize: 16, fontWeight: 600 }}>Analyzing session...</div><div style={{ color: C.mt, fontSize: 13, textAlign: "center" }}>AI is extracting exercises from the transcript</div>
    </div>
  );

  if (phase === "done" && !error) return (
    <div style={{ minHeight: "100dvh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16, padding: 20 }}>
      <div style={{ fontSize: 48 }}>✅</div><div style={{ color: C.tx, fontSize: 18, fontWeight: 700 }}>Session Saved!</div>
      <div style={{ color: C.mt, fontSize: 13, textAlign: "center" }}>{exercises.filter(e => e.name.trim()).length} exercise(s) logged for {isGroup ? `${bookings.filter(b => attendance[b.id]).length} client(s)` : clientName}</div>
      <Btn onClick={onBack} style={{ marginTop: 12 }}>Back to Schedule</Btn>
    </div>
  );

  return (
    <div style={{ background: C.bg, padding: 16, minHeight: "100dvh" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><h2 style={{ color: C.tx, fontSize: 18, margin: 0, fontWeight: 700 }}>Review Session</h2><Badge color={C.ac}>{formatTime(timer)}</Badge></div>
      {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10, marginBottom: 12 }}>{error}</div>}
      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.mt, marginBottom: 8 }}>Attendance{isGroup ? ` (${bookings.length} clients)` : ""}</div>
        {bookings.map(b => { const name = getClientName(b); const present = attendance[b.id]; return (
          <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.bd}` }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{name}</div>
            <button onClick={() => setAttendance(a => ({ ...a, [b.id]: !a[b.id] }))} style={{ padding: "6px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: present ? C.ok + "20" : C.dg + "20", color: present ? C.ok : C.dg }}>{present ? "✅ Present" : "❌ Absent"}</button>
          </div>
        ); })}
      </Card>
      <Card style={{ marginBottom: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>Exercises ({exercises.length})</div>
          <button onClick={addExercise} style={{ padding: "4px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: C.ac + "20", color: C.ac }}>+ Add</button>
        </div>
        {exercises.length === 0 ? <div style={{ color: C.mt, fontSize: 13, textAlign: "center", padding: 16 }}>No exercises extracted. Tap "+ Add" to add manually.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {exercises.map((ex, i) => {
              const cmp = comparisons[ex.name];
              return (
              <div key={i} style={{ padding: 12, background: C.s2, borderRadius: 10, position: "relative" }}>
                <button onClick={() => removeExercise(i)} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: C.dg, cursor: "pointer", fontSize: 16 }}>×</button>
                <Input label="Exercise" value={ex.name} onChange={e => updateExercise(i, "name", e.target.value)} placeholder="e.g. Bench Press" style={{ marginBottom: 8 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}><Input label="Sets" type="number" value={ex.sets} onChange={e => updateExercise(i, "sets", e.target.value)} /><Input label="Reps" type="number" value={ex.reps} onChange={e => updateExercise(i, "reps", e.target.value)} /><Input label="Weight" value={ex.weight} onChange={e => updateExercise(i, "weight", e.target.value)} placeholder="60kg" /></div>
                {cmp?.hasPrior && (cmp.weightDelta !== null || cmp.repsDelta !== null) && (
                  <div style={{ fontSize: 11, color: cmp.weightDelta > 0 ? C.ok : cmp.weightDelta < 0 ? C.wn : C.mt, marginTop: 6, fontWeight: 600 }}>
                    {cmp.weightDelta !== null && `vs last time: ${cmp.weightDelta > 0 ? "+" : ""}${cmp.weightDelta}kg`}
                    {cmp.weightDelta !== null && cmp.repsDelta !== null && " · "}
                    {cmp.repsDelta !== null && `${cmp.repsDelta > 0 ? "+" : ""}${cmp.repsDelta} reps`}
                  </div>
                )}
                {ex.formNotes && <div style={{ fontSize: 11, color: C.ac, marginTop: 6, fontStyle: "italic" }}>🎙️ {ex.formNotes}</div>}
                <Input label="Notes" value={ex.notes} onChange={e => updateExercise(i, "notes", e.target.value)} placeholder="Optional" style={{ marginTop: 6 }} />
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, color: C.mt, fontWeight: 500, marginBottom: 4, display: "block" }}>Form/quality (optional, one tap)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[{ v: 1, e: "😞" }, { v: 2, e: "😐" }, { v: 3, e: "🙂" }, { v: 4, e: "💪" }].map(q => (
                      <button key={q.v} onClick={() => updateExercise(i, "formScore", ex.formScore === q.v ? null : q.v)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "none", cursor: "pointer", background: ex.formScore === q.v ? C.ac + "30" : C.sf, fontSize: 18 }}>{q.e}</button>
                    ))}
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </Card>
      <TextArea label="Session Notes" value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} placeholder="Session summary..." style={{ marginBottom: 12 }} />
      <button onClick={() => setShowTranscript(!showTranscript)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.bd}`, cursor: "pointer", background: C.sf, color: C.mt, fontSize: 13, fontWeight: 600, textAlign: "left", marginBottom: 12 }}>{showTranscript ? "▾" : "▸"} Full Transcript</button>
      {showTranscript && <Card style={{ marginBottom: 12, padding: 14, maxHeight: 200, overflow: "auto" }}><div style={{ fontSize: 12, color: C.tx, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{transcript || "(no transcript)"}</div>{manualNotes && <><div style={{ fontSize: 11, fontWeight: 600, color: C.mt, marginTop: 8, marginBottom: 4 }}>Manual Notes:</div><div style={{ fontSize: 12, color: C.tx, lineHeight: 1.6 }}>{manualNotes}</div></>}</Card>}
      <div style={{ display: "flex", gap: 8 }}><Btn variant="secondary" onClick={onBack} style={{ flex: 1 }}>Discard</Btn><Btn onClick={saveSession} style={{ flex: 2 }}>Save & Complete</Btn></div>
    </div>
  );
}
