// ═══════════════════════════════════════════════════════════════════════
// AUTH CONTEXT — session state (current user) and the four auth actions
// (login, register, googleLogin, logout). Every page that needs to know
// who's logged in, or act on their behalf, goes through useAuth().
// ═══════════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { xToken, xUser, unwrap } from "../lib/utils.js";
import { Splash } from "../components/Loading.jsx";
import { initPushNotifications } from "../lib/pushNotifications.js";
import { initLocalReminders, scheduleDailyReminders, scheduleSessionReminders, logDebugEvent } from "../lib/localReminders.js";
import { promptSavePassword } from "../lib/savePassword.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Registered once, used by api.js whenever any request gets a 401 —
  // without this, the token gets silently cleared but `user` stays set,
  // so the app keeps showing authenticated screens (that then keep
  // failing) instead of clearly dropping back to the login screen.
  useEffect(() => {
    api.onSessionExpired = () => {
      setUser(null);
      alert("Your session has expired. Please sign in again.");
    };
    return () => { api.onSessionExpired = null; };
  }, []);

  // Fires once a user is authenticated, regardless of which path got
  // them there (session-restore, login, register, Google) — registers
  // this device for push and sends the token to the backend, now that
  // there's a valid auth token for that request to succeed with.
  useEffect(() => {
    if (user) initPushNotifications();
  }, [user]);

  // Local, on-device reminder scheduling — separate from push, and
  // deliberately not dependent on it. Runs on every login/session-restore
  // so schedules stay current even if preferences or bookings changed
  // since the last time the app was opened.
  useEffect(() => {
    if (!user) return;
    logDebugEvent(`AuthContext effect started for user ${user.id}`); // fires synchronously, before any async work — proves this code path was reached at all, regardless of what happens next
    (async () => {
      try {
        await initLocalReminders();
        const prefs = await api.get("/notification-preferences/me");
        await scheduleDailyReminders(user.id, prefs);
        const bookingsRes = await api.get("/bookings");
        const bookings = unwrap(bookingsRes, "bookings", "sessions");
        await scheduleSessionReminders(user.id, bookings, prefs?.sessionReminderMinutes ?? 60);
      } catch (e) {
        console.error("Local reminder scheduling failed:", e.message);
        logDebugEvent(`❌ AuthContext scheduling effect crashed: ${e.message}`);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!api.token) return setLoading(false);
    const eps = ["/auth/me", "/auth/profile", "/coaches/me"];
    const t = (i) => {
      if (i >= eps.length) { api.setToken(null); setLoading(false); return; }
      api.get(eps[i]).then((d) => {
        const u = xUser(d);
        if (u && (u.id || u.email)) { setUser({ ...u, name: u.name || d?.profile?.displayName }); setLoading(false); }
        else t(i + 1);
      }).catch(() => t(i + 1));
    };
    t(0);
  }, []);

  const login = async (identifier, password) => {
    const d = await api.post("/auth/login", { identifier, password });
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    const u = xUser(d);
    // The backend's `user` object never includes a display name — it
    // lives separately on the coach/client profile. Merge it in here so
    // the dashboard greeting (and anywhere else showing user.name) isn't
    // silently falling back to a generic placeholder.
    if (u) setUser({ ...u, name: u.name || d?.profile?.displayName || u.email?.split("@")[0] });
    else { try { const m = await api.get("/auth/me"); const mu = xUser(m); setUser(mu ? { ...mu, name: mu.name || m?.profile?.displayName } : { email: identifier }); } catch { setUser({ email: identifier, name: identifier.split("@")[0] }); } }
    promptSavePassword(u?.email || identifier, password); // fire-and-forget — never blocks login on this
  };

  const register = async (pl) => {
    const phone = (pl.phone || "").trim();
    const payload = {
      email: pl.email, username: pl.username || undefined, password: pl.password, role: (pl.role || "CLIENT").toUpperCase(),
      profile: { displayName: pl.name || pl.displayName || pl.email.split("@")[0], phone: phone || undefined, country: pl.country || undefined, city: pl.city || undefined, gymName: pl.gymName || undefined },
    };
    const d = await api.post("/auth/register", payload);
    // New accounts require email verification before a session is
    // issued — no token comes back here anymore. AuthScreen switches to
    // an OTP-entry step and calls verifyEmail() to actually complete
    // registration once the code is confirmed.
    if (d?.requiresVerification) return { requiresVerification: true, email: d.email, pendingSpecializations: pl.specializations };

    // Defensive fallback in case a token somehow does come back (e.g. an
    // older server build) — keeps registration working either way.
    const tk = xToken(d); if (!tk) throw new Error("No token");
    api.setToken(tk);
    const u = xUser(d);
    if (u) { u.role = u.role || payload.role; u.name = u.name || payload.profile.displayName; setUser(u); }
    else { setUser({ email: pl.email, name: payload.profile.displayName, role: payload.role }); }
    return { requiresVerification: false };
  };

  // Completes registration: verifies the OTP and issues the actual
  // session. Specialization/avatar follow-up calls (which need an
  // authenticated session that doesn't exist until this succeeds) are
  // the caller's (AuthScreen's) responsibility to fire afterward — kept
  // out of here since this function's only job is "verify and log in."
  const verifyEmail = async (email, code) => {
    const d = await api.post("/auth/verify-email", { email, code });
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    // verify-email's response only ever carries the bare id/email/role,
    // never the profile (which is where displayName actually lives) —
    // always fetch /auth/me here rather than trying to patch this
    // response shape further.
    try { const m = await api.get("/auth/me"); const mu = xUser(m); setUser(mu ? { ...mu, name: mu.name || m?.profile?.displayName || email.split("@")[0] } : { email, name: email.split("@")[0] }); }
    catch { setUser({ email, name: email.split("@")[0] }); }
  };

  const resendVerificationCode = async (email) => {
    return api.post("/auth/resend-verification", { email });
  };

  const googleLogin = async (credential, role) => {
    const d = await api.post("/auth/google", { credential, role: (role || "CLIENT").toUpperCase() });
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    const u = xUser(d);
    if (u) setUser({ ...u, name: u.name || d?.profile?.displayName || u.email?.split("@")[0] });
    else setUser({ email: d?.user?.email, role: d?.user?.role, name: d?.profile?.displayName || d?.user?.email?.split("@")[0] });
  };

  const logout = () => { api.setToken(null); setUser(null); localStorage.removeItem("cm_admin_original"); };

  // Impersonation: stores the admin's own token+user in localStorage
  // (same persistence model as the active session token itself) before
  // swapping the active session to the target user's real, valid token.
  // Deliberately NOT sessionStorage - if the app fully restarts (not
  // just backgrounds) while impersonating, sessionStorage would be
  // wiped, leaving the admin stuck as the impersonated user with no way
  // back short of a manual logout. "Stop impersonating" restores exactly
  // what was there before, rather than requiring a fresh admin login.
  const [impersonating, setImpersonating] = useState(() => !!localStorage.getItem("cm_admin_original"));

  const impersonate = async (userId) => {
    const original = { token: api.token, user };
    const r = await api.post(`/admin/users/${userId}/impersonate`);
    const tk = xToken(r); if (!tk) throw new Error("No token");
    localStorage.setItem("cm_admin_original", JSON.stringify(original));
    api.setToken(tk);
    const u = xUser(r);
    setUser(u ? { ...u, name: u.email?.split("@")[0] } : { id: r.user?.id, email: r.user?.email, role: r.user?.role });
    setImpersonating(true);
  };

  const stopImpersonating = () => {
    const stored = localStorage.getItem("cm_admin_original");
    if (!stored) return;
    const original = JSON.parse(stored);
    localStorage.removeItem("cm_admin_original");
    api.setToken(original.token);
    setUser(original.user);
    setImpersonating(false);
  };

  if (loading) return <Splash />;
  return <AuthCtx.Provider value={{ user, login, register, logout, googleLogin, verifyEmail, resendVerificationCode, impersonate, stopImpersonating, impersonating }}>{children}</AuthCtx.Provider>;
}
