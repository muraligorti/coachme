// ═══════════════════════════════════════════════════════════════════════
// AUTH CONTEXT — session state (current user) and the four auth actions
// (login, register, googleLogin, logout). Every page that needs to know
// who's logged in, or act on their behalf, goes through useAuth().
// ═══════════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { xToken, xUser } from "../lib/utils.js";
import { Splash } from "../components/Loading.jsx";
import { initPushNotifications } from "../lib/pushNotifications.js";

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

  const login = async (email, password) => {
    const d = await api.post("/auth/login", { email, password });
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    const u = xUser(d);
    if (u) setUser(u);
    else { try { const m = await api.get("/auth/me"); setUser(xUser(m) || { email }); } catch { setUser({ email, name: email.split("@")[0] }); } }
  };

  const register = async (pl) => {
    const phone = (pl.phone || "").trim();
    const payload = {
      email: pl.email, password: pl.password, role: (pl.role || "CLIENT").toUpperCase(),
      profile: { displayName: pl.name || pl.displayName || pl.email.split("@")[0], phone: phone || undefined, country: pl.country || undefined, city: pl.city || undefined },
    };
    const d = await api.post("/auth/register", payload);
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    const u = xUser(d);
    if (u) { u.role = u.role || payload.role; u.name = u.name || payload.profile.displayName; setUser(u); }
    else { setUser({ email: pl.email, name: payload.profile.displayName, role: payload.role }); }
    // Specialization is set via a separate, safe follow-up call — deliberately
    // not folded into the /auth/register payload itself, since that endpoint's
    // exact accepted fields aren't something to guess at. Non-fatal if it
    // fails: the coach can always set this later in Settings.
    if (payload.role === "COACH" && Array.isArray(pl.specializations) && pl.specializations.length) {
      try { await api.put("/coach-profile/specializations", { specializations: pl.specializations }); } catch { /* non-fatal, editable later in Settings */ }
    }
    // Same safe-follow-up pattern for an optional signup photo — works for
    // either role via the real PUT /auth/profile endpoint.
    if (pl.avatar) {
      try { await api.put("/auth/profile", { avatar: pl.avatar }); } catch { /* non-fatal, editable later in Settings */ }
    }
  };

  const googleLogin = async (credential, role) => {
    const d = await api.post("/auth/google", { credential, role: (role || "CLIENT").toUpperCase() });
    const tk = xToken(d); if (!tk) throw new Error("No token"); api.setToken(tk);
    const u = xUser(d); if (u) setUser(u); else setUser({ email: d?.user?.email, role: d?.user?.role });
  };

  const logout = () => { api.setToken(null); setUser(null); };

  if (loading) return <Splash />;
  return <AuthCtx.Provider value={{ user, login, register, logout, googleLogin }}>{children}</AuthCtx.Provider>;
}
