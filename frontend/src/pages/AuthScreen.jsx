// ═══════════════════════════════════════════════════════════════════════
// AUTH SCREEN — login, registration, Google Sign-In, and password reset,
// all as one mode-switched form (rather than separate routes/screens).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useRef, useEffect } from "react";
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
import { promptSavePassword } from "../lib/savePassword.js";
import { api } from "../lib/api.js";
import { GOOGLE_CLIENT_ID } from "../lib/config.js";
import { log, compressImage } from "../lib/utils.js";
import { Card, Btn, Input, Sel } from "../components/ui.jsx";
import { PhoneInput } from "../components/PhoneInput.jsx";

export default function AuthScreen() {
  const { login, register, googleLogin, verifyEmail, resendVerificationCode } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", username: "", gymName: "", password: "", role: "COACH", phone: "", specializations: [], avatar: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [verifyCode, setVerifyCode] = useState("");
  const [verifyEmailAddr, setVerifyEmailAddr] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  // Was hardcoded inline; now admin-configurable (see AdminConfigPage).
  // Defaults match the previous hardcoded list so there's no empty
  // flash while this loads.
  const [specializationOptions, setSpecializationOptions] = useState([
    { v: "strength", l: "💪 Strength" }, { v: "yoga", l: "🧘 Yoga" }, { v: "pilates", l: "🤸 Pilates" },
    { v: "crossfit", l: "🏋️ CrossFit" }, { v: "general", l: "✨ General" },
  ]);
  useEffect(() => { api.get("/config/specializations").then(r => { if (r.specializations?.length) setSpecializationOptions(r.specializations); }).catch(() => {}); }, []);
  const googleBtnRef = useRef(null);

  // Ticks the resend-code cooldown down to 0 once a code has been sent —
  // matches the backend's 60s cooldown, just gives visible feedback
  // instead of the person guessing when they can try again.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

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
      if (!form.email) return setError("Enter your email");
      setBusy(true);
      try {
        const r = await api.post("/auth/forgot-password", { email: form.email });
        setSuccess(r.message || "Reset code sent to your email.");
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
    if (mode === "verify") {
      if (!verifyCode || verifyCode.length !== 6) return setError("Enter the 6-digit code");
      setBusy(true);
      try {
        await verifyEmail(verifyEmailAddr, verifyCode);
        promptSavePassword(verifyEmailAddr, form.password); // fire-and-forget
        // Now that a real session exists, fire the same safe follow-up
        // calls the old single-step register() used to do directly —
        // non-fatal if either fails, both are editable later in Settings.
        if (form.role === "COACH" && form.specializations.length) {
          try { await api.put("/coach-profile/specializations", { specializations: form.specializations }); } catch {}
        }
        if (form.avatar) {
          try { await api.put("/auth/profile", { avatar: form.avatar }); } catch {}
        }
      } catch (e) { setError(e.message); }
      setBusy(false); return;
    }
    if (!form.email || !form.password) return setError("Email and password required");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        const r = await register(form);
        if (r?.requiresVerification) {
          setVerifyEmailAddr(r.email);
          setMode("verify");
          setSuccess(`We sent a 6-digit code to ${r.email}`);
          setResendCooldown(60);
        }
      }
    }
    catch (e) {
      // A login attempt against a real, unverified account gets a
      // specific, actionable path instead of a dead-end error — jump
      // straight into the same verify screen registration would have.
      if (e.details?.requiresVerification && mode === "login") {
        const targetEmail = e.details.email || form.email;
        setVerifyEmailAddr(targetEmail);
        setMode("verify");
        // Unlike the registration flow (where the backend sends the code
        // as part of /auth/register itself), landing here is triggered
        // by a failed *login* attempt - no code has actually been sent
        // yet. Previously this just claimed one had been, which is
        // exactly why the email never arrived.
        try {
          await resendVerificationCode(targetEmail);
          setSuccess("Your email isn't verified yet — we just sent a code to it.");
          setResendCooldown(60);
        } catch (sendErr) {
          setError(`Your email isn't verified yet, and we couldn't send a new code: ${sendErr.message}`);
        }
      } else {
        setError(e.message);
      }
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, padding: 20 }}>
      <Card style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: C.gr, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 12 }}>C</div>
          <h1 style={{ color: C.tx, margin: 0, fontSize: 22, fontWeight: 700 }}>CoachMe.life</h1>
          <p style={{ color: C.mt, margin: "6px 0 0", fontSize: 14 }}>{mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : mode === "verify" ? "Verify your email" : mode === "forgot" ? "Reset your password" : "Enter reset code"}</p>
        </div>
        <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && <Sel label="I am a…" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} options={[{ value: "COACH", label: "Coach" }, { value: "CLIENT", label: "Client" }]} />}
          {mode === "register" && form.role === "COACH" && <div style={{ fontSize: 11.5, color: C.mt, marginTop: -6 }}>You'll start on the <b style={{ color: C.ac }}>Starter</b> plan — up to 5 clients. Upgrades are handled by an admin.</div>}
          {mode === "register" && form.role === "COACH" && (
            <div>
              <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 8, display: "block" }}>What kind of coaching do you do? (pick any)</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {specializationOptions.map(s => {
                  const checked = form.specializations.includes(s.v);
                  return (
                    <button key={s.v} type="button" onClick={() => setForm(f => ({ ...f, specializations: checked ? f.specializations.filter(x => x !== s.v) : [...f.specializations, s.v] }))}
                      style={{ padding: "8px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: checked ? C.ac : C.s2, color: checked ? "#fff" : C.mt }}>{s.l}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: C.mt, marginTop: 6 }}>This shapes which exercises and templates you'll see — you can change it anytime in Settings.</div>
            </div>
          )}
          {(mode === "login" || mode === "register") && <div style={{ display: "flex", justifyContent: "center" }}><div ref={googleBtnRef} /></div>}
          {(mode === "login" || mode === "register") && <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}><div style={{ flex: 1, height: 1, background: C.bd }} /><span style={{ fontSize: 12, color: C.mt }}>or</span><div style={{ flex: 1, height: 1, background: C.bd }} /></div>}
          {mode === "register" && <><Input label="Full Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Murali Gorti" /><PhoneInput label="Mobile Number" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></>}
          {mode === "register" && <Input label="Username (optional)" value={form.username} onChange={e => setForm({ ...form, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })} placeholder="murali_g" />}
          {mode === "register" && form.role === "COACH" && <Input label="Organization / Business Name (optional)" value={form.gymName} onChange={e => setForm({ ...form, gymName: e.target.value })} placeholder="e.g. Iron Fitness Studio" />}
          {mode === "register" && (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {form.avatar ? <img src={form.avatar} alt="" style={{ width: 48, height: 48, borderRadius: 14, objectFit: "cover" }} /> :
                <div style={{ width: 48, height: 48, borderRadius: 14, background: C.s2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: C.mt }}>👤</div>}
              <label style={{ fontSize: 12, fontWeight: 600, color: C.ac, cursor: "pointer" }}>
                {uploadingPhoto ? "Uploading…" : form.avatar ? "Change photo" : "Add a photo (optional)"}
                <input type="file" accept="image/*" disabled={uploadingPhoto} style={{ display: "none" }} onChange={async (e) => {
                  const file = e.target.files?.[0]; if (!file) return;
                  setUploadingPhoto(true);
                  try { const compressed = await compressImage(file, 300, 0.75); setForm(f => ({ ...f, avatar: compressed })); } catch { /* ignore, photo stays optional */ }
                  setUploadingPhoto(false);
                }} />
              </label>
            </div>
          )}

          {mode === "login" && <Input label="Email or Username" name="username" autoComplete="username" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@email.com or username" />}
          {(mode === "register" || mode === "forgot") && <Input label="Email" type="email" name="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />}
          {(mode === "login" || mode === "register") && <Input label="Password" type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />}
          {mode === "reset" && <><Input label="Reset Code" value={resetToken} onChange={e => setResetToken(e.target.value)} placeholder="Paste the code from your email" /><Input label="New Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 8 chars, uppercase, lowercase, number" /></>}
          {mode === "verify" && (
            <>
              <div style={{ fontSize: 13, color: C.mt, textAlign: "center" }}>Enter the 6-digit code sent to<br /><span style={{ color: C.tx, fontWeight: 600 }}>{verifyEmailAddr}</span></div>
              <Input value={verifyCode} onChange={e => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" name="one-time-code" autoComplete="one-time-code"
                style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: 700 }} />
              <div style={{ textAlign: "center" }}>
                <span onClick={async () => {
                  if (resendCooldown > 0) return;
                  setError(""); setSuccess("");
                  try { await resendVerificationCode(verifyEmailAddr); setSuccess("New code sent"); setResendCooldown(60); }
                  catch (e) { setError(e.message); }
                }} style={{ fontSize: 13, color: resendCooldown > 0 ? C.mt : C.ac, cursor: resendCooldown > 0 ? "default" : "pointer", fontWeight: 600 }}>
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </span>
              </div>
            </>
          )}
          {error && <div style={{ color: C.dg, fontSize: 13, padding: "8px 12px", background: C.dg + "15", borderRadius: 8 }}>{error}</div>}
          {success && <div style={{ color: C.ok, fontSize: 13, padding: "8px 12px", background: C.ok + "15", borderRadius: 8 }}>{success}</div>}
          <Btn type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Please wait…" : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : mode === "verify" ? "Verify & Continue" : mode === "forgot" ? "Send Reset Code" : "Reset Password"}</Btn>
          {mode === "login" && <p style={{ color: C.mt, fontSize: 13, textAlign: "center", margin: 0 }}><span onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }} style={{ color: C.ac, cursor: "pointer", fontWeight: 600 }}>Forgot Password?</span></p>}
          {mode === "verify" ? (
            <p style={{ color: C.mt, fontSize: 13, textAlign: "center", margin: 0 }}><span onClick={() => { setMode("login"); setError(""); setSuccess(""); }} style={{ color: C.ac, cursor: "pointer", fontWeight: 600 }}>← Back to Sign In</span></p>
          ) : (
            <p style={{ color: C.mt, fontSize: 13, textAlign: "center", margin: 0 }}>{mode === "login" ? "No account?" : mode === "register" ? "Have an account?" : "Remember your password?"}{" "}<span onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); }} style={{ color: C.ac, cursor: "pointer", fontWeight: 600 }}>{mode === "login" ? "Sign Up" : "Sign In"}</span></p>
          )}
        </form>
      </Card>
    </div>
  );
}
