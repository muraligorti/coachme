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

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
        if (u && (u.id || u.email)) { setUser(u); setLoading(false); }
        else t(i + 1);
      }).catch(() => t(i + 1));
    };
    t(0);
  }, []);

  const login = async (identifier, password) => {
    const d = await api.post("/auth/login", { identifier, password });
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    const u = xUser(d);
    if (u) setUser(u);
    else { try { const m = await api.get("/auth/me"); setUser(xUser(m) || { email: identifier }); } catch { setUser({ email: identifier, name: identifier.split("@")[0] }); } }
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
    const u = xUser(d);
    if (u) setUser(u);
    else { try { const m = await api.get("/auth/me"); setUser(xUser(m) || { email }); } catch { setUser({ email, name: email.split("@")[0] }); } }
  };

  const resendVerificationCode = async (email) => {
    return api.post("/auth/resend-verification", { email });
  };

  const googleLogin = async (credential, role) => {
    const d = await api.post("/auth/google", { credential, role: (role || "CLIENT").toUpperCase() });
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    const u = xUser(d); if (u) setUser(u); else setUser({ email: d?.user?.email, role: d?.user?.role });
  };

  const logout = () => { api.setToken(null); setUser(null); };

  if (loading) return <Splash />;
  return <AuthCtx.Provider value={{ user, login, register, logout, googleLogin, verifyEmail, resendVerificationCode }}>{children}</AuthCtx.Provider>;
}
