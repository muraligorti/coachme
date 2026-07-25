// ═══════════════════════════════════════════════════════════════════════
// AUTH SCREEN — login, registration, Google Sign-In, and password reset,
// all as one mode-switched form (rather than separate routes/screens).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { GOOGLE_CLIENT_ID } from "../lib/config.js";
import { log } from "../lib/utils.js";
import { Card, Btn, Input, Sel } from "../components/ui.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";

export default function AuthScreen() {
  const { login, register, googleLogin } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CLIENT", phone: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetMethod, setResetMethod] = useState("email");
  const googleBtnRef = useRef(null);

  // Render the official Google "Sign in with Google" button whenever we're on the
  // login/register screen. The role picked in the register form is passed through
  // so a Google sign-up creates a COACH or CLIENT account to match the user's choice.
  //
  // NOTE: the GIS script tag in index.html loads with async/defer, so it can finish
  // loading *after* this component has already mounted and this effect has already
  // run once. We poll briefly for window.google to show up instead of only checking once.
  useEffect(() => {
    if (mode !== "login" && mode !== "register") return;
    if (GOOGLE_CLIENT_ID.startsWith("YOUR_GOOGLE_CLIENT_ID")) { log("Set GOOGLE_CLIENT_ID in lib/config.js to enable Google Sign-In"); return; }
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return false;
      if (!window.google?.accounts?.id || !googleBtnRef.current) return false;
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (resp) => {
            setError(""); setSuccess(""); setBusy(true);
            try { await googleLogin(resp.credential, form.role); } catch (e) { setError(e.message); }
            setBusy(false);
          },
        });
        googleBtnRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleBtnRef.current, { theme: "outline", size: "large", width: 320, text: mode === "register" ? "signup_with" : "signin_with" });
        return true;
      } catch (e) { log("Google button render failed:", e.message); return false; }
    };
    if (tryRender()) return;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (tryRender() || attempts > 30 || cancelled) clearInterval(interval);
      if (attempts > 30 && !cancelled) log("Google Identity Services script never loaded — check your network tab for a blocked request to accounts.google.com");
    }, 200);
    return () => { cancelled = true; clearInterval(interval); };
  }, [mode, form.role]);

  const submit = async () => {
    setError(""); setSuccess("");
    if (mode === "forgot") {
      const contact = resetMethod === "sms" ? form.phone : form.email;
      if (!contact) return setError(resetMethod === "sms" ? "Enter your mobile number" : "Enter your email");
      setBusy(true);
      try {
        const r = await api.post("/auth/forgot-password", { email: resetMethod === "email" ? form.email : undefined, phone: resetMethod === "sms" ? form.phone : undefined });
        if (r.code) { setResetToken(r.code); setSuccess(`Your reset code is: ${r.code}`); }
        else { setSuccess(r.message || `Reset code sent via ${resetMethod === "sms" ? "SMS" : "email"}.`); }
        setMode("reset");
      } catch (e) { setError(e.message); }
      setBusy(false); return;
    }
    if (mode === "reset") {
      if (!resetToken || !newPassword) return setError("Enter reset code and new password");
      setBusy(true);
      try { await api.post("/auth/reset-password", { token: resetToken, password: newPassword }); setSuccess("Password reset! You can now sign in."); setMode("login"); }
      catch (e) { setError(e.message); }
      setBusy(false); return;
    }
    if (!form.email || !form.password) return setError("Email and password required");
    setBusy(true);
    try { mode === "login" ? await login(form.email, form.password) : await register(form); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 20 }}>
      <Card style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.gr, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 12 }}>C</div>
          <h1 style={{ color: C.tx, margin: 0, fontSize: 22, fontWeight: 700 }}>CoachMe.life</h1>
          <p style={{ color: C.mt, margin: "6px 0 0", fontSize: 14 }}>{mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Enter reset code"}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && <Sel label="I am a…" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} options={[{ value: "COACH", label: "Coach" }, { value: "CLIENT", label: "Client" }]} />}
          {(mode === "login" || mode === "register") && <div style={{ display: "flex", justifyContent: "center" }}><div ref={googleBtnRef} /></div>}
          {(mode === "login" || mode === "register") && <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}><div style={{ flex: 1, height: 1, background: C.bd }} /><span style={{ fontSize: 12, color: C.mt }}>or</span><div style={{ flex: 1, height: 1, background: C.bd }} /></div>}
          {mode === "register" && <><Input label="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Murali Gorti" /><PhoneInput label="Mobile Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></>}
          {mode === "forgot" && <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>{[{ id: "sms", label: "📱 SMS" }, { id: "email", label: "📧 Email" }].map(m => <button key={m.id} onClick={() => setResetMethod(m.id)} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: resetMethod === m.id ? C.ac + "20" : C.s2, color: resetMethod === m.id ? C.ac : C.mt }}>{m.label}</button>)}</div>}
          {mode === "forgot" && resetMethod === "sms" && <PhoneInput label="Mobile Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />}
          {(mode === "login" || mode === "register" || (mode === "forgot" && resetMethod === "email")) && <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />}
          {(mode === "login" || mode === "register") && <Input label="Password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />}
          {mode === "reset" && <><Input label="Reset Code" value={resetToken} onChange={e => setResetToken(e.target.value)} placeholder="Paste the code from your email" /><Input label="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 chars, uppercase, lowercase, number" /></>}
          {error && <div style={{ color: C.dg, fontSize: 13, padding: "8px 12px", background: C.dg + "15", borderRadius: 8 }}>{error}</div>}
          {success && <div style={{ color: C.ok, fontSize: 13, padding: "8px 12px", background: C.ok + "15", borderRadius: 8 }}>{success}</div>}
          <Btn onClick={submit} disabled={busy} style={{ width: "100%" }}>{busy ? "Please wait…" : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : mode === "forgot" ? "Send Reset Code" : "Reset Password"}</Btn>
          {mode === "login" && <p style={{ color: C.mt, fontSize: 13, textAlign: "center", margin: 0 }}><span onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }} style={{ color: C.ac, cursor: "pointer", fontWeight: 600 }}>Forgot Password?</span></p>}
          <p style={{ color: C.mt, fontSize: 13, textAlign: "center", margin: 0 }}>{mode === "login" ? "No account?" : mode === "register" ? "Have an account?" : "Remember your password?"}{" "}<span onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); }} style={{ color: C.ac, cursor: "pointer", fontWeight: 600 }}>{mode === "login" ? "Sign Up" : "Sign In"}</span></p>
        </div>
      </Card>
    </div>
  );
}
