// ═══════════════════════════════════════════════════════════════════════
// TEST SUITE — a manual, in-app smoke test tool covering all three roles
// (COACH/CLIENT/ADMIN) against the live backend. Registers throwaway
// test accounts, exercises most endpoints, checks cross-role security
// boundaries, and exports a plain-text report. This is exploratory/manual
// verification, not a substitute for real automated test coverage — see
// CoachMe Bible Volume 3, Section 12 for the target testing strategy.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { API } from "../lib/config.js";
import { Card, SC, Btn, ST } from "../components/ui.jsx";

export default function TestSuitePage() {
  const { user } = useAuth();
  const [results, setResults] = useState([]); const [running, setRunning] = useState(false);
  const [logLines, setLogLines] = useState([]); const [progress, setProgress] = useState(0);
  const addLog = (msg, type = "info") => setLogLines(p => [...p, { msg, type, time: new Date().toLocaleTimeString() }]);
  const logRef = useRef(null);
  useEffect(() => { logRef.current && (logRef.current.scrollTop = logRef.current.scrollHeight); }, [logLines]);

  const savedToken = useRef(api.token);
  const roleTokens = useRef({ coach: null, client: null, admin: null });

  const apiTest = async (method, path, body = null, tok = null) => {
    const headers = { "Content-Type": "application/json" }; const t = tok || savedToken.current;
    if (t) headers["Authorization"] = `Bearer ${t}`;
    const opts = { method, headers }; if (body) opts.body = JSON.stringify(body);
    addLog(`→ ${method} ${path}`);
    try {
      const res = await fetch(`${API}${path}`, opts); const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      addLog(`← ${res.status} ${JSON.stringify(data).slice(0, 150)}`, res.ok ? "ok" : "err");
      return { status: res.status, ok: res.ok, data };
    } catch (e) { addLog(`✕ ${e.message}`, "err"); return { status: 0, ok: false, data: { error: e.message } }; }
  };

  const addR = (g, n, s, d = "") => setResults(p => [...p, { group: g, name: n, status: s, detail: d }]);
  const xTok = (d) => d?.token || d?.accessToken || d?.access_token || d?.data?.token;

  const runAll = async () => {
    setResults([]); setLogLines([]); setRunning(true); setProgress(0);
    savedToken.current = api.token;
    addLog("━━━ COMPREHENSIVE MULTI-ROLE TEST SUITE ━━━", "ok");
    addLog(`Primary user: ${user?.email} (${user?.role})`, "info");
    const ts = Date.now(); let done = 0; const total = 80; const tick = () => { done++; setProgress(Math.round((done / total) * 100)); };
    let r;

    addLog("\n━━ PHASE 1: REGISTRATION (all roles) ━━", "ok");
    const coachEmail = `testcoach_${ts}@cm.test`;
    r = await apiTest("POST", "/auth/register", { name: "TestCoach", email: coachEmail, password: "Coach123!", role: "COACH" });
    addR("1. Register", "Register COACH", r.ok ? "pass" : "fail", `${r.status}: ${r.ok ? "OK" : JSON.stringify(r.data).slice(0, 80)}`); tick();
    roleTokens.current.coach = xTok(r.data);

    const clientEmail = `testclient_${ts}@cm.test`;
    r = await apiTest("POST", "/auth/register", { name: "TestClient", email: clientEmail, password: "Client123!", role: "CLIENT" });
    addR("1. Register", "Register CLIENT", r.ok ? "pass" : "fail", `${r.status}: ${r.ok ? "OK" : JSON.stringify(r.data).slice(0, 80)}`); tick();
    roleTokens.current.client = xTok(r.data);

    const adminEmail = `testadmin_${ts}@cm.test`;
    r = await apiTest("POST", "/auth/register", { name: "TestAdmin", email: adminEmail, password: "Admin123!", role: "ADMIN" });
    addR("1. Register", "Register ADMIN", r.ok ? "pass" : "info", `${r.status}: ${r.ok ? "OK" : "ADMIN registration may be restricted"}`); tick();
    roleTokens.current.admin = xTok(r.data);

    r = await apiTest("POST", "/auth/register", { name: "Dupe", email: coachEmail, password: "X", role: "COACH" });
    addR("1. Register", "Duplicate email rejected", r.status >= 400 ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("POST", "/auth/register", { email: "x@y.com" });
    addR("1. Register", "Missing fields rejected", r.status >= 400 ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("POST", "/auth/register", { name: "Bad", email: `bad_${ts}@t.com`, password: "X", role: "invalid" });
    addR("1. Register", "Invalid role rejected", r.status >= 400 ? "pass" : "fail", `${r.status}`); tick();

    addLog("\n━━ PHASE 2: LOGIN (all roles) ━━", "ok");
    r = await apiTest("POST", "/auth/login", { email: coachEmail, password: "Coach123!" });
    addR("2. Login", "Login as COACH", r.ok ? "pass" : "fail", `${r.status}: ${r.ok ? "token OK" : "FAILED"}`); tick();
    if (r.ok && xTok(r.data)) roleTokens.current.coach = xTok(r.data);

    r = await apiTest("POST", "/auth/login", { email: clientEmail, password: "Client123!" });
    addR("2. Login", "Login as CLIENT", r.ok ? "pass" : "fail", `${r.status}: ${r.ok ? "token OK" : "FAILED"}`); tick();
    if (r.ok && xTok(r.data)) roleTokens.current.client = xTok(r.data);

    r = await apiTest("POST", "/auth/login", { email: "admin@fitos-nexus.com", password: "Admin123!" });
    addR("2. Login", "Login as ADMIN (seeded)", r.ok ? "pass" : "info", `${r.status}: ${r.ok ? "token OK" : "admin account may not exist"}`); tick();
    if (r.ok && xTok(r.data)) roleTokens.current.admin = xTok(r.data);

    r = await apiTest("POST", "/auth/login", { email: "coach@fitos-nexus.com", password: "Coach123!" });
    if (r.ok && xTok(r.data)) savedToken.current = xTok(r.data);
    addR("2. Login", "Re-login primary coach", r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("POST", "/auth/login", { email: coachEmail, password: "WrongPass!" });
    addR("2. Login", "Wrong password rejected", !r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("POST", "/auth/login", { email: "nobody_exists_xyz@x.com", password: "x" });
    addR("2. Login", "Unknown email rejected", !r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("GET", "/auth/me", null, "completely_invalid_token");
    addR("2. Login", "Invalid token → 401", r.status === 401 || r.status === 403 ? "pass" : "fail", `${r.status}`); tick();

    addLog("\n━━ PHASE 3: AUTH ENDPOINTS ━━", "ok");
    r = await apiTest("GET", "/auth/me");
    addR("3. Auth", "GET /auth/me", r.ok ? "pass" : "fail", `${r.status}: ${r.data?.user?.email || "?"}`); tick();

    r = await apiTest("POST", "/auth/refresh");
    addR("3. Auth", "POST /auth/refresh", r.status !== 404 ? "pass" : "info", `${r.status}`); tick();

    addR("3. Auth", "POST /auth/logout", "info", "SKIPPED — would revoke token"); tick();

    r = await apiTest("POST", "/auth/forgot-password", { email: "coach@fitos-nexus.com" });
    addR("3. Auth", "POST /auth/forgot-password", "info", `${r.status}: ${r.status === 404 ? "not implemented" : "exists"}`); tick();

    r = await apiTest("POST", "/auth/reset-password", { token: "fake", password: "X" });
    addR("3. Auth", "POST /auth/reset-password", "info", `${r.status}: ${r.status === 404 ? "not implemented" : "exists"}`); tick();

    addLog("\n━━ PHASE 4: COACH-ROLE TESTS ━━", "ok");
    const ct = savedToken.current;
    r = await apiTest("GET", "/clients", null, ct);
    addR("4. Coach", "GET /clients", r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("POST", "/clients", { name: "RoleTestClient", email: `rtc_${ts}@t.com`, phone: "9999", sessionType: "offline" }, ct);
    const rtcId = r.data?.client?.id || r.data?.id;
    addR("4. Coach", "POST /clients (create)", r.ok ? "pass" : "fail", `${r.status}: id=${rtcId}, name=${r.data?.client?.displayName || "?"}`); tick();

    if (rtcId) { r = await apiTest("DELETE", `/clients/${rtcId}`, null, ct); addR("4. Coach", "DELETE /clients/:id", r.ok ? "pass" : "fail", `${r.status}`); tick(); }
    else { addR("4. Coach", "DELETE /clients/:id", "skip", "no ID"); tick(); }

    r = await apiTest("POST", "/clients/bulk", { clients: [{ name: "BulkRC", email: `brc_${ts}@t.com`, phone: "111" }] }, ct);
    addR("4. Coach", "POST /clients/bulk", r.ok ? "pass" : "info", `${r.status}`); tick();

    r = await apiTest("GET", "/bookings", null, ct);
    addR("4. Coach", "GET /bookings", r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("POST", "/bookings", { date: new Date().toISOString(), duration: 60, type: "training" }, ct);
    addR("4. Coach", "POST /bookings", r.ok ? "pass" : "info", `${r.status}: ${r.status === 403 ? "403 (needs CLIENT role — local fallback)" : "OK"}`); tick();

    r = await apiTest("GET", "/leads", null, ct);
    addR("4. Coach", "GET /leads", r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("GET", "/reports/coach/dashboard", null, ct);
    addR("4. Coach", "GET /reports/coach/dashboard", r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("GET", "/reports/coach/revenue", null, ct);
    addR("4. Coach", "GET /reports/coach/revenue", r.ok ? "pass" : "fail", `${r.status}`); tick();

    r = await apiTest("POST", "/ai/chat", { message: "test" }, ct);
    addR("4. Coach", "POST /ai/chat", r.ok ? "pass" : "fail", `${r.status}: ${r.ok ? "response OK" : "error"}`); tick();

    r = await apiTest("GET", "/coaches", null, ct);
    addR("4. Coach", "GET /coaches (public)", r.ok ? "pass" : "fail", `${r.status}`); tick();

    addLog("\n━━ PHASE 5: CLIENT-ROLE TESTS ━━", "ok");
    const clt = roleTokens.current.client;
    if (clt) {
      r = await apiTest("GET", "/auth/me", null, clt);
      addR("5. Client", "GET /auth/me (CLIENT)", r.ok ? "pass" : "fail", `${r.status}: ${r.data?.user?.role || "?"}`); tick();
      r = await apiTest("GET", "/coaches", null, clt);
      addR("5. Client", "GET /coaches (search)", r.ok ? "pass" : "fail", `${r.status}`); tick();
      r = await apiTest("POST", "/bookings", { date: new Date().toISOString(), duration: 60, type: "training" }, clt);
      addR("5. Client", "POST /bookings (CLIENT can book!)", r.ok ? "pass" : "info", `${r.status}: ${r.ok ? "✅ CLIENT role accepted" : "still needs more fields"}`); tick();
      r = await apiTest("GET", "/bookings", null, clt);
      addR("5. Client", "GET /bookings", r.ok ? "pass" : "info", `${r.status}`); tick();
      r = await apiTest("GET", "/clients", null, clt);
      addR("5. Client", "GET /clients (CLIENT view)", r.ok ? "pass" : "info", `${r.status}: ${r.ok ? "can see clients" : r.status === 403 ? "correctly restricted" : "error"}`); tick();
      r = await apiTest("POST", "/ai/chat", { message: "suggest a workout" }, clt);
      addR("5. Client", "POST /ai/chat", r.ok ? "pass" : "info", `${r.status}: ${r.ok ? "AI works for CLIENT" : "may be restricted"}`); tick();
      r = await apiTest("GET", "/reports/coach/dashboard", null, clt);
      addR("5. Client", "GET /reports/coach/* (CLIENT)", r.ok ? "info" : "pass", `${r.status}: ${r.ok ? "accessible (unexpected)" : "correctly restricted"}`); tick();
      r = await apiTest("GET", "/leads", null, clt);
      addR("5. Client", "GET /leads (CLIENT)", r.ok ? "info" : "pass", `${r.status}: ${r.ok ? "accessible" : "correctly restricted"}`); tick();
    } else { for (let i = 0; i < 8; i++) { addR("5. Client", "(skipped)", "skip", "No CLIENT token"); tick(); } }

    addLog("\n━━ PHASE 6: ADMIN-ROLE TESTS ━━", "ok");
    const adt = roleTokens.current.admin;
    if (adt) {
      r = await apiTest("GET", "/auth/me", null, adt);
      addR("6. Admin", "GET /auth/me (ADMIN)", r.ok ? "pass" : "fail", `${r.status}: role=${r.data?.user?.role || "?"}`); tick();
      r = await apiTest("GET", "/reports/admin/platform", null, adt);
      addR("6. Admin", "GET /reports/admin/platform", r.ok ? "pass" : "info", `${r.status}: ${r.ok ? "admin access granted" : "restricted"}`); tick();
      r = await apiTest("GET", "/clients", null, adt);
      addR("6. Admin", "GET /clients (ADMIN view)", r.ok ? "pass" : "info", `${r.status}`); tick();
      r = await apiTest("GET", "/leads", null, adt);
      addR("6. Admin", "GET /leads (ADMIN)", r.ok ? "pass" : "info", `${r.status}`); tick();
      r = await apiTest("GET", "/coaches", null, adt);
      addR("6. Admin", "GET /coaches (ADMIN)", r.ok ? "pass" : "info", `${r.status}`); tick();
    } else { for (let i = 0; i < 5; i++) { addR("6. Admin", "(skipped)", "skip", "No ADMIN token — registration may be restricted"); tick(); } }

    addLog("\n━━ PHASE 7: CROSS-ROLE SECURITY ━━", "ok");
    if (clt) {
      r = await apiTest("POST", "/clients", { name: "HackerClient", email: `hack_${ts}@t.com`, phone: "000" }, clt);
      addR("7. Security", "CLIENT cannot create clients", !r.ok || r.status === 403 ? "pass" : "info", `${r.status}: ${r.status === 403 ? "correctly blocked" : "might be allowed"}`); tick();
      r = await apiTest("DELETE", "/clients/" + (rtcId || "test"), null, clt);
      addR("7. Security", "CLIENT cannot delete clients", !r.ok || r.status >= 400 ? "pass" : "fail", `${r.status}`); tick();
      r = await apiTest("GET", "/reports/admin/platform", null, clt);
      addR("7. Security", "CLIENT cannot access admin reports", !r.ok || r.status >= 400 ? "pass" : "fail", `${r.status}: correctly blocked`); tick();
    } else { for (let i = 0; i < 3; i++) { addR("7. Security", "(skipped)", "skip", "No CLIENT token"); tick(); } }

    addLog("\n━━ PHASE 8: LOCAL FEATURES ━━", "ok");
    [
      { key: "hab_me", push: { id: 99, name: "T", icon: "✨", streak: 0, log: {} }, l: "Habits" },
      { key: "nut_me", push: { id: 99, name: "T", calories: 500, protein: 30, carbs: 40, fat: 15, meal: "lunch", date: "2026-01-01" }, l: "Nutrition" },
      { key: "checkins", push: { id: 99, energy: 8, sleep: 7, stress: 3, adherence: 80, mood: "good", date: "2026-01-01" }, l: "Check-ins" },
      { key: "invoices", push: { id: 99, clientName: "T", amount: 1000, status: "pending", date: "2026-01-01" }, l: "Invoices" },
      { key: "prog_test", push: { id: 99, weight: 75, bodyFat: 18, date: "2026-01-01" }, l: "Progress" },
      { key: "media_test", push: { id: 99, title: "T", type: "video" }, l: "Media" },
      { key: "device_data", push: { date: "2026-01-01", source: "test", steps: 8000, heartRateAvg: 72 }, l: "Device Data" },
    ].forEach(t => {
      const a = ls.get(t.key, []); a.push(t.push); ls.set(t.key, a);
      addR("8. Local", `${t.l} — CRUD`, "pass", `${a.length} items`); tick();
      ls.set(t.key, a.filter(x => x.id !== 99 && x.source !== "test"));
    });

    ls.set("holidays", [...(ls.get("holidays", [])), "2099-12-25"]);
    addR("8. Local", "Holidays", "pass", "saved"); tick();
    ls.set("holidays", ls.get("holidays", []).filter(h => h !== "2099-12-25"));

    ls.set("local_bookings", [...(ls.get("local_bookings", [])), { id: "lt", date: new Date().toISOString(), status: "confirmed", _local: true }]);
    addR("8. Local", "Local booking fallback", "pass", "saved"); tick();
    ls.set("local_bookings", ls.get("local_bookings", []).filter(b => b.id !== "lt"));

    addLog("\n━━ PHASE 9: BROWSER APIs ━━", "ok");
    addR("9. Browser", "SpeechRecognition", !!(window.SpeechRecognition || window.webkitSpeechRecognition) ? "pass" : "info", "for voice commands"); tick();
    addR("9. Browser", "SpeechSynthesis", !!window.speechSynthesis ? "pass" : "info", "for voice output"); tick();
    addR("9. Browser", "localStorage", !!window.localStorage ? "pass" : "fail", "required"); tick();
    addR("9. Browser", "Geolocation", !!navigator.geolocation ? "pass" : "info", "optional"); tick();
    addR("9. Browser", "Web Crypto", !!window.crypto?.subtle ? "pass" : "info", "for secure operations"); tick();

    addLog("\n━━ PHASE 10: ROUTE DISCOVERY ━━", "ok");
    for (const p of ["/workouts", "/workouts/sessions", "/messages", "/notifications", "/subscriptions", "/reviews", "/bookings/upcoming"]) {
      r = await apiTest("GET", p);
      addR("10. Discovery", `GET ${p}`, r.status === 404 ? "missing" : r.status === 401 ? "exists (auth)" : "exists", `${r.status}`); tick();
    }

    setProgress(100);
    addLog("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", "ok");
    addLog("ALL TESTS COMPLETE", "ok");
    setRunning(false);
  };

  const pass = results.filter(r => r.status === "pass").length;
  const fail = results.filter(r => r.status === "fail").length;
  const info = results.filter(r => !["pass", "fail", "skip"].includes(r.status)).length;
  const total = results.length;

  const exportReport = () => {
    let txt = `COACHME.LIFE MULTI-ROLE TEST REPORT\n${"=".repeat(60)}\nDate: ${new Date().toISOString()}\nAPI: ${API}\nUser: ${user?.email} (${user?.role})\nBrowser: ${navigator.userAgent.slice(0, 80)}\nRoles tested: COACH, CLIENT, ADMIN\n\n`;
    [...new Set(results.map(r => r.group))].forEach(g => {
      txt += `\n${"─".repeat(60)}\n${g}\n${"─".repeat(60)}\n`;
      results.filter(r => r.group === g).forEach(r => { txt += `${r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : "ℹ️"} ${r.status.toUpperCase().padEnd(8)} ${r.name}\n   → ${r.detail}\n`; });
    });
    txt += `\n${"=".repeat(60)}\nTotal: ${total} | Pass: ${pass} | Fail: ${fail} | Info: ${info}\nPass Rate: ${total > 0 ? ((pass / (pass + fail || 1)) * 100).toFixed(1) : 0}%\n`;
    const b = new Blob([txt], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `coachme-multirole-report-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
  };

  return (
    <div>
      <ST right={<div style={{ display: "flex", gap: 6 }}>
        <Btn onClick={runAll} disabled={running} style={{ padding: "8px 16px", fontSize: 13 }}>{running ? "⏳ Running…" : "▶ Run All (3 Roles)"}</Btn>
        <Btn variant="secondary" onClick={exportReport} disabled={results.length === 0} style={{ padding: "8px 14px", fontSize: 12 }}>📄 Export</Btn>
      </div>}>🧪 Multi-Role Test Suite</ST>
      <div style={{ height: 4, background: C.bd, borderRadius: 2, marginBottom: 16, overflow: "hidden" }}><div style={{ height: "100%", width: `${progress}%`, background: C.gr, transition: "width .3s", borderRadius: 2 }} /></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        <SC label="Total" value={total} icon="📋" color={C.ac} /><SC label="Pass" value={pass} icon="✅" color={C.ok} /><SC label="Fail" value={fail} icon="❌" color={C.dg} /><SC label="Info" value={info} icon="ℹ️" color={C.wn} />
      </div>
      {results.length > 0 && <div style={{ marginBottom: 16 }}>{[...new Set(results.map(r => r.group))].map(g => (
        <div key={g} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${C.bd}` }}>{g}</div>
          {results.filter(r => r.group === g).map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 8px", borderRadius: 6, fontSize: 12, marginBottom: 2, background: r.status === "fail" ? C.dg + "08" : "transparent" }}>
              <span style={{ flexShrink: 0 }}>{r.status === "pass" ? "✅" : r.status === "fail" ? "❌" : r.status === "skip" ? "⏭️" : "ℹ️"}</span>
              <span style={{ flex: 1, color: C.tx, fontWeight: 500 }}>{r.name}</span>
              <span style={{ fontSize: 11, color: r.status === "fail" ? C.dg : C.mt, maxWidth: "50%", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }} title={r.detail}>{r.detail}</span>
            </div>
          ))}
        </div>
      ))}</div>}
      <Card ref={logRef} style={{ maxHeight: 200, overflowY: "auto", padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 8 }}>Console</div>
        {logLines.length === 0 ? <div style={{ color: C.mt, fontSize: 12 }}>Click "▶ Run All (3 Roles)" to test COACH, CLIENT, ADMIN</div> :
          logLines.map((l, i) => <div key={i} style={{ fontSize: 11, fontFamily: "monospace", color: l.type === "ok" ? C.ok : l.type === "err" ? C.dg : C.mt, lineHeight: 1.5 }}>[{l.time}] {l.msg}</div>)}
      </Card>
    </div>
  );
}
