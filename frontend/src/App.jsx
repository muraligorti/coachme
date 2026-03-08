// CoachMe.life — Full-Feature App.jsx
// Backend: just-perception-production.up.railway.app
// All routes wired: auth, workouts, bookings, reports, ai/chat, clients, leads, coaches

import { useState, useEffect, useRef, useCallback, createContext, useContext, useMemo } from "react";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const API = "https://just-perception-production.up.railway.app/api";

// ─── DEBUG ────────────────────────────────────────────────────────────────────
const DEBUG = true;
const log = (...args) => DEBUG && console.log("[CoachMe]", ...args);

// ─── API CLIENT (JWT) ─────────────────────────────────────────────────────────
const api = {
  token: localStorage.getItem("cm_token"),
  _loggedOut: false,
  setToken(t) {
    this.token = t;
    t ? localStorage.setItem("cm_token", t) : localStorage.removeItem("cm_token");
    log("Token set:", t ? t.slice(0, 20) + "…" : "null");
  },
  async req(path, opts = {}) {
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const url = `${API}${path}`;
    log(`→ ${opts.method || "GET"} ${url}`);
    try {
      const res = await fetch(url, { ...opts, headers });
      log(`← ${res.status} ${res.statusText} from ${path}`);
      if (res.status === 401 && !path.includes("/auth/login") && !path.includes("/auth/register")) {
        log("401 received — clearing token (no reload)");
        this.setToken(null);
        this._loggedOut = true;
        throw new Error("Session expired. Please log in again.");
      }
      const text = await res.text();
      log(`Response body (first 300):`, text.slice(0, 300));
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!res.ok) {
        throw new Error(data.message || data.error || res.statusText);
      }
      return data;
    } catch (err) {
      if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
        log("CORS or network error on", path);
        throw new Error(`Network error on ${path} — possible CORS issue. Check browser console.`);
      }
      throw err;
    }
  },
  get: (p) => api.req(p),
  post: (p, b) => api.req(p, { method: "POST", body: JSON.stringify(b) }),
  put: (p, b) => api.req(p, { method: "PUT", body: JSON.stringify(b) }),
  del: (p) => api.req(p, { method: "DELETE" }),
};

// Helper to unwrap array data from various response shapes
function unwrapList(data, ...keys) {
  for (const key of keys) {
    if (data?.[key] && Array.isArray(data[key])) return data[key];
    if (data?.data?.[key] && Array.isArray(data.data[key])) return data.data[key];
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  log("unwrapList: could not find array in", Object.keys(data || {}));
  return [];
}

// ─── AUTH CONTEXT ─────────────────────────────────────────────────────────────
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

// Extract token from any response shape
function extractToken(data) {
  const t = data?.token || data?.accessToken || data?.access_token
    || data?.data?.token || data?.data?.accessToken || data?.jwt;
  log("extractToken:", t ? t.slice(0, 20) + "…" : "NOT FOUND", "| keys:", Object.keys(data || {}));
  return t;
}

// Extract user from any response shape
function extractUser(data) {
  const u = data?.user || data?.data?.user || data?.data || data?.profile || data?.coach || data?.client;
  // If response itself looks like a user (has email or name at top level)
  if (!u && data && (data.email || data.name || data.id)) {
    log("extractUser: using top-level data as user");
    return data;
  }
  log("extractUser:", u ? `found (id=${u.id}, name=${u.name})` : "NOT FOUND", "| keys:", Object.keys(data || {}));
  return u;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (!api.token) {
      log("No stored token, showing login");
      return setLoading(false);
    }
    log("Found stored token, verifying with /auth/me…");

    // Try multiple possible "get current user" endpoints
    const tryEndpoints = ["/auth/me", "/auth/profile", "/coaches/me", "/users/me"];
    const tryNext = (i) => {
      if (i >= tryEndpoints.length) {
        log("All auth endpoints failed — clearing token");
        api.setToken(null);
        setLoading(false);
        return;
      }
      api.get(tryEndpoints[i])
        .then((data) => {
          const u = extractUser(data);
          if (u && (u.id || u.email)) {
            log("✅ Auth verified via", tryEndpoints[i]);
            setUser(u);
            setLoading(false);
          } else {
            log("Endpoint", tryEndpoints[i], "returned no user, trying next…");
            tryNext(i + 1);
          }
        })
        .catch((err) => {
          log("Endpoint", tryEndpoints[i], "failed:", err.message, "— trying next…");
          tryNext(i + 1);
        });
    };
    tryNext(0);
  }, []);

  const login = async (email, password) => {
    setAuthError("");
    log("Attempting login for", email);
    const data = await api.post("/auth/login", { email, password });
    log("Login response:", JSON.stringify(data).slice(0, 500));

    const token = extractToken(data);
    const u = extractUser(data);

    if (!token) {
      const msg = "Login succeeded but no token found in response. Check console for response shape.";
      log("❌", msg);
      setAuthError(msg);
      throw new Error(msg);
    }

    api.setToken(token);

    if (u && (u.id || u.email)) {
      setUser(u);
    } else {
      // Token works but no user object — try fetching
      log("No user in login response, fetching profile…");
      try {
        const meData = await api.get("/auth/me");
        setUser(extractUser(meData) || { email });
      } catch {
        // Just use email as fallback user
        setUser({ email, name: email.split("@")[0] });
      }
    }
    log("✅ Login complete");
  };

  const register = async (payload) => {
    setAuthError("");
    log("Attempting register for", payload.email);
    const data = await api.post("/auth/register", payload);
    log("Register response:", JSON.stringify(data).slice(0, 500));

    const token = extractToken(data);
    const u = extractUser(data);

    if (!token) {
      const msg = "Registration succeeded but no token found. Check console.";
      log("❌", msg);
      setAuthError(msg);
      throw new Error(msg);
    }

    api.setToken(token);

    if (u && (u.id || u.email)) {
      setUser(u);
    } else {
      try {
        const meData = await api.get("/auth/me");
        setUser(extractUser(meData) || { email: payload.email, name: payload.name });
      } catch {
        setUser({ email: payload.email, name: payload.name });
      }
    }
    log("✅ Register complete");
  };

  const logout = () => { api.setToken(null); setUser(null); };

  if (loading) return <SplashScreen />;
  return <AuthCtx.Provider value={{ user, login, register, logout, authError }}>{children}</AuthCtx.Provider>;
}

// ─── VOICE COMMANDS HOOK ──────────────────────────────────────────────────────
function useVoice(onCommand) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const speak = useCallback((text) => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.pitch = 1;
    speechSynthesis.speak(u);
  }, []);

  const toggle = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return speak("Voice not supported on this browser");

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e) => {
      const transcript = e.results[0][0].transcript.toLowerCase().trim();
      onCommand(transcript, speak);
      setListening(false);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recognitionRef.current = r;
    r.start();
    setListening(true);
  }, [listening, onCommand, speak]);

  return { listening, toggle, speak };
}

// ─── DESIGN SYSTEM PRIMITIVES ─────────────────────────────────────────────────
const colors = {
  bg: "#0a0a0f",
  surface: "#12121a",
  surfaceHover: "#1a1a25",
  border: "#1e1e2e",
  text: "#e4e4ef",
  textMuted: "#7a7a8e",
  accent: "#6c5ce7",
  accentAlt: "#00cec9",
  gradient: "linear-gradient(135deg, #6c5ce7 0%, #a29bfe 50%, #00cec9 100%)",
  danger: "#ff4757",
  warning: "#ffa502",
  success: "#2ed573",
};

const Card = ({ children, style, className = "", onClick, ...props }) => (
  <div
    onClick={onClick}
    className={className}
    style={{
      background: colors.surface,
      border: `1px solid ${colors.border}`,
      borderRadius: 16,
      padding: 20,
      ...style,
    }}
    {...props}
  >
    {children}
  </div>
);

const Badge = ({ children, color = colors.accent, style }) => (
  <span
    style={{
      display: "inline-block",
      padding: "4px 12px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      background: color + "22",
      color,
      ...style,
    }}
  >
    {children}
  </span>
);

const Btn = ({ children, variant = "primary", style, disabled, ...props }) => {
  const base = {
    padding: "12px 24px",
    borderRadius: 12,
    border: "none",
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all 0.2s",
    opacity: disabled ? 0.5 : 1,
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  };
  const variants = {
    primary: { background: colors.gradient, color: "#fff" },
    secondary: { background: colors.surfaceHover, color: colors.text, border: `1px solid ${colors.border}` },
    danger: { background: colors.danger + "22", color: colors.danger },
    ghost: { background: "transparent", color: colors.textMuted },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} disabled={disabled} {...props}>{children}</button>;
};

const Input = ({ label, style, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
    {label && <label style={{ fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
    <input
      style={{
        background: colors.surfaceHover,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: "12px 16px",
        color: colors.text,
        fontSize: 14,
        outline: "none",
        fontFamily: "inherit",
        width: "100%",
        boxSizing: "border-box",
        ...style,
      }}
      {...props}
    />
  </div>
);

const Select = ({ label, options, style, ...props }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
    {label && <label style={{ fontSize: 13, color: colors.textMuted, fontWeight: 500 }}>{label}</label>}
    <select
      style={{
        background: colors.surfaceHover,
        border: `1px solid ${colors.border}`,
        borderRadius: 10,
        padding: "12px 16px",
        color: colors.text,
        fontSize: 14,
        outline: "none",
        fontFamily: "inherit",
        ...style,
      }}
      {...props}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  </div>
);

const Modal = ({ open, onClose, title, children }) => {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: colors.surface, borderRadius: 20, padding: 24, maxWidth: 480,
          width: "100%", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${colors.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ color: colors.text, margin: 0, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: colors.textMuted, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
    <div style={{
      width: 32, height: 32, border: `3px solid ${colors.border}`,
      borderTopColor: colors.accent, borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }} />
  </div>
);

const Empty = ({ icon, text }) => (
  <div style={{ textAlign: "center", padding: 48, color: colors.textMuted }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 14 }}>{text}</div>
  </div>
);

// ─── ICONS (inline SVG) ──────────────────────────────────────────────────────
const Icon = ({ name, size = 22, color = "currentColor" }) => {
  const icons = {
    home: <><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></>,
    users: <><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></>,
    dumbbell: <><path d="M6.5 6.5h11M6 12h12M4 8h2v8H4zM18 8h2v8h-2zM2 10h2v4H2zM20 10h2v4h-2z" /></>,
    calendar: <><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></>,
    chart: <><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></>,
    chat: <><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></>,
    bot: <><path d="M12 2a2 2 0 012 2v1h3a2 2 0 012 2v3a2 2 0 01-2 2h-1v2h1a2 2 0 012 2v3a2 2 0 01-2 2H7a2 2 0 01-2-2v-3a2 2 0 012-2h1v-2H7a2 2 0 01-2-2V7a2 2 0 012-2h3V4a2 2 0 012-2zM9 9a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" /></>,
    mic: <><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4m-3 0h6M12 1a3 3 0 00-3 3v6a3 3 0 006 0V4a3 3 0 00-3-3z" /></>,
    send: <><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></>,
    plus: <><path d="M12 4v16m8-8H4" /></>,
    check: <><path d="M5 13l4 4L19 7" /></>,
    x: <><path d="M6 18L18 6M6 6l12 12" /></>,
    settings: <><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></>,
    leads: <><path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></>,
    logout: <><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></>,
    phone: <><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></>,
    play: <><polygon points="5 3 19 12 5 21 5 3" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || icons.home}
    </svg>
  );
};

// ─── SPLASH SCREEN ────────────────────────────────────────────────────────────
function SplashScreen() {
  return (
    <div style={{
      height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: colors.bg, flexDirection: "column", gap: 16,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: colors.gradient,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 28, fontWeight: 800, color: "#fff",
      }}>C</div>
      <Spinner />
    </div>
  );
}

// ─── AUTH SCREENS ─────────────────────────────────────────────────────────────
function AuthScreen() {
  const { login, register, authError } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "coach" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!form.email || !form.password) {
      setError("Email and password are required");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await register(form);
    } catch (e) {
      log("Auth error:", e.message);
      setError(e.message);
    }
    setBusy(false);
  };

  const displayError = error || authError;

  return (
    <div style={{
      minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center",
      background: colors.bg, padding: 20,
    }}>
      <Card style={{ maxWidth: 400, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, background: colors.gradient,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 800, color: "#fff", marginBottom: 12,
          }}>C</div>
          <h1 style={{ color: colors.text, margin: 0, fontSize: 22, fontWeight: 700 }}>CoachMe.life</h1>
          <p style={{ color: colors.textMuted, margin: "6px 0 0", fontSize: 14 }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {mode === "register" && (
            <>
              <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
              <Select
                label="I am a…"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                options={[{ value: "coach", label: "Coach" }, { value: "client", label: "Client" }]}
              />
            </>
          )}
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />

          {displayError && <div style={{ color: colors.danger, fontSize: 13, padding: "8px 12px", background: colors.danger + "15", borderRadius: 8, wordBreak: "break-word" }}>{displayError}</div>}

          <Btn onClick={handleSubmit} disabled={busy} style={{ width: "100%", marginTop: 4 }}>
            {busy ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </Btn>

          <p style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", margin: "8px 0 0" }}>
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <span
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              style={{ color: colors.accent, cursor: "pointer", fontWeight: 600 }}
            >
              {mode === "login" ? "Sign Up" : "Sign In"}
            </span>
          </p>
        </div>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: DASHBOARD (/api/reports/summary)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/reports/coach/dashboard").then((data) => {
      log("✅ Dashboard data:", data);
      setStats(data?.data || data);
    }).catch((err) => {
      log("Dashboard error:", err.message);
      setStats({ totalClients: 0, activeClients: 0, totalRevenue: 0, monthlyRevenue: 0, totalBookings: 0, upcomingBookings: 0, totalLeads: 0, conversionRate: 0 });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  const cards = [
    { label: "Active Clients", value: stats?.activeClients ?? 0, icon: "users", color: colors.accent },
    { label: "Monthly Revenue", value: `₹${(stats?.monthlyRevenue ?? 0).toLocaleString()}`, icon: "chart", color: colors.success },
    { label: "Upcoming Sessions", value: stats?.upcomingBookings ?? 0, icon: "calendar", color: colors.accentAlt },
    { label: "Leads", value: stats?.totalLeads ?? 0, icon: "leads", color: colors.warning },
  ];

  return (
    <div>
      <h2 style={{ color: colors.text, fontSize: 20, margin: "0 0 20px", fontWeight: 700 }}>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, background: c.color + "18",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name={c.icon} size={18} color={c.color} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: colors.text }}>{c.value}</div>
            <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{c.label}</div>
          </Card>
        ))}
      </div>

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 8 }}>Quick Stats</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.textMuted, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
          <span>Total Clients</span><span style={{ color: colors.text, fontWeight: 600 }}>{stats?.totalClients ?? 0}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.textMuted, padding: "8px 0", borderBottom: `1px solid ${colors.border}` }}>
          <span>All-time Revenue</span><span style={{ color: colors.text, fontWeight: 600 }}>₹{(stats?.totalRevenue ?? 0).toLocaleString()}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: colors.textMuted, padding: "8px 0" }}>
          <span>Conversion Rate</span><span style={{ color: colors.text, fontWeight: 600 }}>{stats?.conversionRate ?? 0}%</span>
        </div>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: CLIENTS (/api/clients)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ClientsPage({ onOpenChat }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/clients").then((d) => { log("Clients response:", d); setClients(unwrapList(d, "clients")); }).catch((e) => log("Clients error:", e.message)).finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter((c) =>
    (c.name || c.user?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, margin: 0, fontWeight: 700 }}>Clients</h2>
        <Badge>{clients.length}</Badge>
      </div>
      <Input placeholder="Search clients…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 14 }} />
      {filtered.length === 0 ? (
        <Empty icon="👥" text="No clients found" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((c) => (
            <Card key={c.id} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 12, background: colors.gradient,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0,
              }}>
                {(c.name || c.user?.name || "?")[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>{c.name || c.user?.name}</div>
                <div style={{ color: colors.textMuted, fontSize: 12 }}>{c.email || c.user?.email}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={() => onOpenChat?.(c)}
                  style={{
                    width: 34, height: 34, borderRadius: 8, border: "none", cursor: "pointer",
                    background: colors.accentAlt + "20", display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Icon name="chat" size={16} color={colors.accentAlt} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: LEADS (/api/leads)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "website", notes: "" });

  const load = () => api.get("/leads").then((d) => { log("Leads response:", d); setLeads(unwrapList(d, "leads")); }).catch((e) => log("Leads error:", e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const addLead = async () => {
    await api.post("/leads", form);
    setForm({ name: "", email: "", phone: "", source: "website", notes: "" });
    setShowAdd(false);
    load();
  };

  const statusColors = { new: colors.accentAlt, contacted: colors.warning, converted: colors.success, lost: colors.danger };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, margin: 0, fontWeight: 700 }}>Leads</h2>
        <Btn onClick={() => setShowAdd(true)} style={{ padding: "8px 16px", fontSize: 13 }}><Icon name="plus" size={16} /> Add</Btn>
      </div>

      {leads.length === 0 ? (
        <Empty icon="🎯" text="No leads yet — add your first one!" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {leads.map((l) => (
            <Card key={l.id} style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>{l.name}</div>
                  <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{l.email} · {l.phone}</div>
                </div>
                <Badge color={statusColors[l.status] || colors.accent}>{l.status || "new"}</Badge>
              </div>
              {l.notes && <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>{l.notes}</div>}
            </Card>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Lead">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Select label="Source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
            options={[{ value: "website", label: "Website" }, { value: "referral", label: "Referral" }, { value: "social", label: "Social Media" }, { value: "other", label: "Other" }]} />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Btn onClick={addLead} style={{ width: "100%", marginTop: 8 }}>Save Lead</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: WORKOUTS (/api/workouts)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function WorkoutsPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    title: "", description: "", clientId: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60, notes: "" }],
  });

  const load = () => {
    Promise.all([
      api.get("/workouts").catch(() => ({ workouts: [] })),
      api.get("/clients").catch(() => ({ clients: [] })),
    ]).then(([w, c]) => {
      log("Workouts response:", w);
      setPlans(unwrapList(w, "workouts", "plans"));
      setClients(unwrapList(c, "clients"));
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const addExercise = () => setForm({ ...form, exercises: [...form.exercises, { name: "", sets: 3, reps: 12, rest: 60, notes: "" }] });
  const removeExercise = (i) => setForm({ ...form, exercises: form.exercises.filter((_, j) => j !== i) });
  const updateExercise = (i, field, value) => {
    const ex = [...form.exercises];
    ex[i] = { ...ex[i], [field]: value };
    setForm({ ...form, exercises: ex });
  };

  const save = async () => {
    await api.post("/workouts", form);
    setForm({ title: "", description: "", clientId: "", exercises: [{ name: "", sets: 3, reps: 12, rest: 60, notes: "" }] });
    setShowBuilder(false);
    load();
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, margin: 0, fontWeight: 700 }}>Workout Plans</h2>
        <Btn onClick={() => setShowBuilder(true)} style={{ padding: "8px 16px", fontSize: 13 }}><Icon name="plus" size={16} /> Create</Btn>
      </div>

      {plans.length === 0 ? (
        <Empty icon="💪" text="No workout plans yet" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {plans.map((p) => (
            <Card key={p.id} style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <div style={{ color: colors.text, fontWeight: 600, fontSize: 15 }}>{p.title}</div>
                  {p.description && <div style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>{p.description}</div>}
                </div>
                <Badge color={p.status === "active" ? colors.success : colors.textMuted}>{p.status || "draft"}</Badge>
              </div>
              {p.exercises && (
                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(Array.isArray(p.exercises) ? p.exercises : []).slice(0, 4).map((ex, i) => (
                    <span key={i} style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                      background: colors.accent + "15", color: colors.accent,
                    }}>
                      {ex.name || ex} · {ex.sets}×{ex.reps}
                    </span>
                  ))}
                  {(p.exercises?.length || 0) > 4 && (
                    <span style={{ fontSize: 11, color: colors.textMuted, padding: "4px 0" }}>+{p.exercises.length - 4} more</span>
                  )}
                </div>
              )}
              {p.client && (
                <div style={{ marginTop: 10, fontSize: 12, color: colors.textMuted }}>
                  Assigned to: <span style={{ color: colors.accentAlt, fontWeight: 500 }}>{p.client.name || p.client.user?.name}</span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={showBuilder} onClose={() => setShowBuilder(false)} title="Create Workout Plan">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Plan Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. PPL Week 1" />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          {clients.length > 0 && (
            <Select label="Assign to Client"
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              options={[{ value: "", label: "— Select —" }, ...clients.map((c) => ({ value: c.id, label: c.name || c.user?.name }))]}
            />
          )}

          <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginTop: 8 }}>Exercises</div>
          {form.exercises.map((ex, i) => (
            <Card key={i} style={{ padding: 12, background: colors.surfaceHover }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: colors.textMuted, fontWeight: 600 }}>Exercise {i + 1}</span>
                {form.exercises.length > 1 && (
                  <button onClick={() => removeExercise(i)} style={{ background: "none", border: "none", cursor: "pointer", color: colors.danger, fontSize: 18 }}>✕</button>
                )}
              </div>
              <Input placeholder="Exercise name" value={ex.name} onChange={(e) => updateExercise(i, "name", e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Input label="Sets" type="number" value={ex.sets} onChange={(e) => updateExercise(i, "sets", +e.target.value)} />
                <Input label="Reps" type="number" value={ex.reps} onChange={(e) => updateExercise(i, "reps", +e.target.value)} />
                <Input label="Rest(s)" type="number" value={ex.rest} onChange={(e) => updateExercise(i, "rest", +e.target.value)} />
              </div>
            </Card>
          ))}
          <Btn variant="secondary" onClick={addExercise} style={{ width: "100%" }}><Icon name="plus" size={16} /> Add Exercise</Btn>
          <Btn onClick={save} style={{ width: "100%", marginTop: 4 }}>Save Workout Plan</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: BOOKINGS / SCHEDULER (/api/bookings)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [clients, setClients] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [form, setForm] = useState({ clientId: "", date: selectedDate, time: "09:00", duration: 60, type: "training", notes: "" });

  const load = () => {
    Promise.all([
      api.get("/bookings").catch(() => ({ bookings: [] })),
      api.get("/clients").catch(() => ({ clients: [] })),
    ]).then(([b, c]) => {
      log("Bookings response:", b);
      setBookings(unwrapList(b, "bookings", "sessions"));
      setClients(unwrapList(c, "clients"));
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    await api.post("/bookings", { ...form, date: form.date + "T" + form.time + ":00" });
    setShowAdd(false);
    load();
  };

  // Build simple week calendar
  const getWeekDays = () => {
    const base = new Date(selectedDate);
    const day = base.getDay();
    const start = new Date(base);
    start.setDate(base.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };
  const weekDays = getWeekDays();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const dayBookings = bookings.filter((b) => {
    const bDate = new Date(b.date || b.startTime || b.scheduledAt).toISOString().slice(0, 10);
    return bDate === selectedDate;
  }).sort((a, b) => new Date(a.date || a.startTime || a.scheduledAt) - new Date(b.date || b.startTime || b.scheduledAt));

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, margin: 0, fontWeight: 700 }}>Schedule</h2>
        <Btn onClick={() => setShowAdd(true)} style={{ padding: "8px 16px", fontSize: 13 }}><Icon name="plus" size={16} /> Book</Btn>
      </div>

      {/* Week strip */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto" }}>
        {weekDays.map((d, i) => {
          const iso = d.toISOString().slice(0, 10);
          const isSelected = iso === selectedDate;
          const isToday = iso === new Date().toISOString().slice(0, 10);
          const hasBooking = bookings.some((b) => (new Date(b.date || b.startTime || b.scheduledAt).toISOString().slice(0, 10)) === iso);
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(iso)}
              style={{
                flex: 1, minWidth: 44, padding: "10px 4px", borderRadius: 12, border: "none", cursor: "pointer",
                background: isSelected ? colors.gradient : colors.surfaceHover,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                transition: "all 0.2s",
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 600, color: isSelected ? "#fff" : colors.textMuted, textTransform: "uppercase" }}>
                {dayNames[d.getDay()]}
              </span>
              <span style={{ fontSize: 16, fontWeight: 700, color: isSelected ? "#fff" : colors.text }}>{d.getDate()}</span>
              {hasBooking && <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected ? "#fff" : colors.accent }} />}
            </button>
          );
        })}
      </div>

      {/* Day's bookings */}
      {dayBookings.length === 0 ? (
        <Empty icon="📅" text="No sessions on this day" />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dayBookings.map((b) => {
            const t = new Date(b.date || b.startTime || b.scheduledAt);
            const time = t.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return (
              <Card key={b.id} style={{ padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{
                  width: 48, display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "6px 0", borderRadius: 8, background: colors.accent + "15",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.accent }}>{time}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
                    {b.client?.name || b.client?.user?.name || b.type || "Session"}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{b.duration || 60} min · {b.type || "training"}</div>
                </div>
                <Badge color={b.status === "confirmed" ? colors.success : b.status === "cancelled" ? colors.danger : colors.warning}>
                  {b.status || "pending"}
                </Badge>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Book Session">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {clients.length > 0 && (
            <Select label="Client" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              options={[{ value: "", label: "— Select —" }, ...clients.map((c) => ({ value: c.id, label: c.name || c.user?.name }))]} />
          )}
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label="Time" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Duration (min)" type="number" value={form.duration} onChange={(e) => setForm({ ...form, duration: +e.target.value })} />
            <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              options={[{ value: "training", label: "Training" }, { value: "assessment", label: "Assessment" }, { value: "consultation", label: "Consultation" }]} />
          </div>
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Btn onClick={save} style={{ width: "100%", marginTop: 4 }}>Confirm Booking</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: REPORTS & ANALYTICS (/api/reports)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ReportsPage() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  useEffect(() => {
    setLoading(true);
    const endpoint = {
      dashboard: "/reports/coach/dashboard",
      revenue: "/reports/coach/revenue",
      clients: "/reports/coach/clients",
      workouts: "/reports/coach/workouts",
    }[activeTab] || "/reports/coach/dashboard";

    api.get(endpoint).then((d) => {
      log(`✅ Reports (${activeTab}):`, d);
      setData(d?.data || d);
    }).catch((e) => {
      log("Reports error:", e.message);
      setData({});
    }).finally(() => setLoading(false));
  }, [activeTab]);

  if (loading) return <Spinner />;

  const revenue = data?.revenue || data?.monthlyRevenue || [];
  const clients = data?.clientGrowth || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: colors.text, fontSize: 20, margin: 0, fontWeight: 700 }}>Analytics</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "dashboard", label: "Overview" },
            { id: "revenue", label: "Revenue" },
            { id: "clients", label: "Clients" },
            { id: "workouts", label: "Workouts" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: activeTab === t.id ? colors.accent : colors.surfaceHover,
                color: activeTab === t.id ? "#fff" : colors.textMuted,
              }}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {/* Revenue chart (simple bar viz) */}
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, marginBottom: 4 }}>Revenue</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: colors.success, marginBottom: 16 }}>
          ₹{((data?.totalRevenue || data?.revenue?.total) ?? 0).toLocaleString()}
        </div>
        {Array.isArray(revenue) && revenue.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
            {revenue.map((r, i) => {
              const val = typeof r === "number" ? r : r.amount || r.value || 0;
              const max = Math.max(...revenue.map((x) => (typeof x === "number" ? x : x.amount || x.value || 0)), 1);
              const h = (val / max) * 100;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{
                    width: "100%", height: h, borderRadius: 4, minHeight: 2,
                    background: colors.gradient, opacity: 0.6 + (i / revenue.length) * 0.4,
                  }} />
                  <span style={{ fontSize: 9, color: colors.textMuted }}>{r.label || r.month || i + 1}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: colors.textMuted }}>Sessions Completed</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: colors.accent, marginTop: 4 }}>{data?.sessionsCompleted ?? data?.totalBookings ?? 0}</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: colors.textMuted }}>Client Retention</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: colors.accentAlt, marginTop: 4 }}>{data?.retentionRate ?? 0}%</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: colors.textMuted }}>Avg Session/Client</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: colors.warning, marginTop: 4 }}>{data?.avgSessionsPerClient ?? 0}</div>
        </Card>
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: colors.textMuted }}>Conversion Rate</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: colors.success, marginTop: 4 }}>{data?.conversionRate ?? 0}%</div>
        </Card>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: AI COACH CHAT (/api/ai/chat)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AIChatPage() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! I'm your AI coaching assistant. Ask me about workout plans, nutrition, client management, or anything fitness-related." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: msg }]);
    setLoading(true);
    try {
      const res = await api.post("/ai/chat", { message: msg, history: messages.slice(-10) });
      setMessages((m) => [...m, { role: "assistant", content: res.reply || res.message || res.response || "I'll look into that." }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I couldn't process that. Please try again." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 160px)" }}>
      <h2 style={{ color: colors.text, fontSize: 20, margin: "0 0 12px", fontWeight: 700, flexShrink: 0 }}>AI Coach</h2>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            maxWidth: "82%",
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            padding: "12px 16px",
            borderRadius: 16,
            borderBottomRightRadius: m.role === "user" ? 4 : 16,
            borderBottomLeftRadius: m.role === "user" ? 16 : 4,
            background: m.role === "user" ? colors.accent : colors.surfaceHover,
            color: m.role === "user" ? "#fff" : colors.text,
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: "flex-start", padding: "12px 20px", borderRadius: 16, background: colors.surfaceHover }}>
            <div style={{ display: "flex", gap: 4 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%", background: colors.textMuted,
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0, paddingTop: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask your AI coach…"
          style={{
            flex: 1, background: colors.surfaceHover, border: `1px solid ${colors.border}`,
            borderRadius: 14, padding: "12px 16px", color: colors.text, fontSize: 14,
            outline: "none", fontFamily: "inherit",
          }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            width: 48, height: 48, borderRadius: 14, border: "none", cursor: "pointer",
            background: colors.gradient, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon name="send" size={18} color="#fff" />
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: MESSAGING (WhatsApp-style) — coach ↔ client
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MessagingPage({ initialClient, onBack }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat] = useState(initialClient || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  // Load conversations list
  useEffect(() => {
    api.get("/clients").then((d) => setConversations(unwrapList(d, "clients"))).catch((e) => log("Messages clients error:", e.message));
  }, []);

  // Load messages for active chat
  useEffect(() => {
    if (!activeChat) return;
    const loadMessages = () => {
      api.get(`/messages/${activeChat.id || activeChat.userId}`).then((d) => setMessages(unwrapList(d, "messages"))).catch((e) => log("Messages error:", e.message));
    };
    setLoadingMsgs(true);
    loadMessages();
    setLoadingMsgs(false);
    // Poll every 5s
    pollRef.current = setInterval(loadMessages, 5000);
    return () => clearInterval(pollRef.current);
  }, [activeChat]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMsg = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    // Optimistic
    setMessages((m) => [...m, { id: Date.now(), senderId: user?.id, content: text, createdAt: new Date().toISOString() }]);
    try {
      await api.post("/messages", { recipientId: activeChat.id || activeChat.userId, content: text });
    } catch {}
  };

  // Conversation list view
  if (!activeChat) {
    return (
      <div>
        <h2 style={{ color: colors.text, fontSize: 20, margin: "0 0 16px", fontWeight: 700 }}>Messages</h2>
        {conversations.length === 0 ? (
          <Empty icon="💬" text="No conversations yet" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {conversations.map((c) => (
              <Card
                key={c.id}
                onClick={() => setActiveChat(c)}
                style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 22, background: colors.gradient,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 17, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {(c.name || c.user?.name || "?")[0].toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>{c.name || c.user?.name}</div>
                  <div style={{ color: colors.textMuted, fontSize: 12 }}>Tap to chat</div>
                </div>
                <Icon name="chat" size={18} color={colors.textMuted} />
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Chat view
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100dvh - 160px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <button
          onClick={() => { setActiveChat(null); onBack?.(); }}
          style={{ background: "none", border: "none", cursor: "pointer", color: colors.text, fontSize: 20, padding: 0 }}
        >←</button>
        <div style={{
          width: 36, height: 36, borderRadius: 18, background: colors.gradient,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 700, color: "#fff",
        }}>
          {(activeChat.name || activeChat.user?.name || "?")[0].toUpperCase()}
        </div>
        <div>
          <div style={{ color: colors.text, fontSize: 15, fontWeight: 600 }}>{activeChat.name || activeChat.user?.name}</div>
          <div style={{ color: colors.success, fontSize: 11 }}>● online</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
        {messages.length === 0 && <Empty icon="💬" text="Start the conversation" />}
        {messages.map((m) => {
          const isMe = m.senderId === user?.id;
          return (
            <div key={m.id} style={{
              maxWidth: "78%", alignSelf: isMe ? "flex-end" : "flex-start",
              padding: "10px 14px", borderRadius: 14,
              borderBottomRightRadius: isMe ? 4 : 14,
              borderBottomLeftRadius: isMe ? 14 : 4,
              background: isMe ? colors.accent : colors.surfaceHover,
              color: isMe ? "#fff" : colors.text, fontSize: 14, lineHeight: 1.45,
            }}>
              {m.content}
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: "right" }}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, flexShrink: 0, paddingTop: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMsg()}
          placeholder="Type a message…"
          style={{
            flex: 1, background: colors.surfaceHover, border: `1px solid ${colors.border}`,
            borderRadius: 24, padding: "12px 18px", color: colors.text, fontSize: 14,
            outline: "none", fontFamily: "inherit",
          }}
        />
        <button
          onClick={sendMsg}
          style={{
            width: 48, height: 48, borderRadius: 24, border: "none", cursor: "pointer",
            background: colors.gradient, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon name="send" size={18} color="#fff" />
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGE: SETTINGS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SettingsPage() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [saved, setSaved] = useState(false);

  const save = async () => {
    try {
      await api.put("/auth/profile", profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  return (
    <div>
      <h2 style={{ color: colors.text, fontSize: 20, margin: "0 0 20px", fontWeight: 700 }}>Settings</h2>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: colors.gradient,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 700, color: "#fff",
          }}>{(user?.name || "U")[0].toUpperCase()}</div>
          <div>
            <div style={{ color: colors.text, fontSize: 16, fontWeight: 600 }}>{user?.name}</div>
            <Badge>{user?.role || "coach"}</Badge>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          <Input label="Email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          <Btn onClick={save} style={{ width: "100%" }}>{saved ? "✓ Saved!" : "Update Profile"}</Btn>
        </div>
      </Card>

      <Card>
        <Btn variant="danger" onClick={logout} style={{ width: "100%" }}>
          <Icon name="logout" size={16} /> Sign Out
        </Btn>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BOTTOM TAB NAVIGATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const TABS = [
  { id: "dashboard", icon: "home", label: "Home" },
  { id: "workouts", icon: "dumbbell", label: "Workouts" },
  { id: "bookings", icon: "calendar", label: "Schedule" },
  { id: "chat", icon: "chat", label: "Messages" },
  { id: "more", icon: "settings", label: "More" },
];

function BottomNav({ active, onChange }) {
  return (
    <nav style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: colors.surface,
      borderTop: `1px solid ${colors.border}`,
      display: "flex",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      {TABS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
              gap: 3, padding: "10px 0 8px", border: "none", cursor: "pointer",
              background: "transparent", transition: "all 0.2s",
            }}
          >
            <div style={{
              padding: "4px 16px", borderRadius: 12,
              background: isActive ? colors.accent + "20" : "transparent",
              transition: "all 0.3s",
            }}>
              <Icon name={tab.icon} size={20} color={isActive ? colors.accent : colors.textMuted} />
            </div>
            <span style={{
              fontSize: 10, fontWeight: isActive ? 700 : 500,
              color: isActive ? colors.accent : colors.textMuted,
            }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MORE MENU (overflow tabs)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MoreMenu({ onNav }) {
  const items = [
    { id: "clients", icon: "users", label: "Clients", desc: "Manage your clients" },
    { id: "leads", icon: "leads", label: "Leads", desc: "Track & convert leads" },
    { id: "reports", icon: "chart", label: "Analytics", desc: "Revenue & reports" },
    { id: "ai", icon: "bot", label: "AI Coach", desc: "AI coaching assistant" },
    { id: "settings", icon: "settings", label: "Settings", desc: "Profile & preferences" },
  ];

  return (
    <div>
      <h2 style={{ color: colors.text, fontSize: 20, margin: "0 0 16px", fontWeight: 700 }}>More</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <Card key={item.id} onClick={() => onNav(item.id)} style={{ padding: 16, display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12, background: colors.accent + "15",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon name={item.icon} size={20} color={colors.accent} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: colors.text, fontSize: 14, fontWeight: 600 }}>{item.label}</div>
              <div style={{ color: colors.textMuted, fontSize: 12 }}>{item.desc}</div>
            </div>
            <span style={{ color: colors.textMuted, fontSize: 18 }}>›</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN APP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MainApp() {
  const [tab, setTab] = useState("dashboard");
  const [subPage, setSubPage] = useState(null);
  const [chatClient, setChatClient] = useState(null);

  // Voice commands
  const handleVoice = useCallback((cmd, speak) => {
    const routes = {
      dashboard: ["home", "dashboard"],
      workouts: ["workout", "workouts", "exercise", "training"],
      bookings: ["schedule", "booking", "bookings", "calendar"],
      chat: ["message", "messages", "chat"],
      clients: ["client", "clients"],
      leads: ["lead", "leads"],
      reports: ["report", "reports", "analytics", "revenue"],
      ai: ["ai", "assistant", "coach"],
      settings: ["setting", "settings", "profile"],
    };

    for (const [route, keywords] of Object.entries(routes)) {
      if (keywords.some((k) => cmd.includes(k))) {
        if (["clients", "leads", "reports", "ai", "settings"].includes(route)) {
          setTab("more");
          setSubPage(route);
        } else {
          setTab(route);
          setSubPage(null);
        }
        speak(`Opening ${route}`);
        return;
      }
    }
    speak("I didn't catch that. Try saying a page name like dashboard, workouts, or schedule.");
  }, []);

  const { listening, toggle: toggleVoice } = useVoice(handleVoice);

  const navigate = (id) => {
    if (["dashboard", "workouts", "bookings", "chat"].includes(id)) {
      setTab(id);
      setSubPage(null);
    } else if (id === "more") {
      setTab("more");
      setSubPage(null);
    } else {
      setTab("more");
      setSubPage(id);
    }
  };

  const renderPage = () => {
    if (tab === "more" && subPage) {
      switch (subPage) {
        case "clients": return <ClientsPage onOpenChat={(c) => { setChatClient(c); setTab("chat"); }} />;
        case "leads": return <LeadsPage />;
        case "reports": return <ReportsPage />;
        case "ai": return <AIChatPage />;
        case "settings": return <SettingsPage />;
        default: return <MoreMenu onNav={(id) => setSubPage(id)} />;
      }
    }
    switch (tab) {
      case "dashboard": return <DashboardPage />;
      case "workouts": return <WorkoutsPage />;
      case "bookings": return <BookingsPage />;
      case "chat": return <MessagingPage initialClient={chatClient} onBack={() => setChatClient(null)} />;
      case "more": return <MoreMenu onNav={(id) => setSubPage(id)} />;
      default: return <DashboardPage />;
    }
  };

  return (
    <div style={{
      minHeight: "100dvh", background: colors.bg, color: colors.text,
      fontFamily: "'DM Sans', 'SF Pro Display', -apple-system, system-ui, sans-serif",
    }}>
      {/* Global CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { background: ${colors.bg}; overflow-x: hidden; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
        input::placeholder, textarea::placeholder { color: ${colors.textMuted}; }
        select option { background: ${colors.surface}; color: ${colors.text}; }
      `}</style>

      {/* Voice FAB */}
      <button
        onClick={toggleVoice}
        style={{
          position: "fixed", right: 16, bottom: 80, zIndex: 200,
          width: 48, height: 48, borderRadius: 24, border: "none", cursor: "pointer",
          background: listening ? colors.danger : colors.gradient,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 20px ${listening ? colors.danger + "60" : colors.accent + "40"}`,
          animation: listening ? "pulse 1.5s ease infinite" : "none",
          transition: "all 0.3s",
        }}
        title="Voice Command"
      >
        <Icon name="mic" size={20} color="#fff" />
      </button>

      {/* Page content */}
      <div style={{ padding: "16px 16px 90px", maxWidth: 600, margin: "0 auto" }}>
        {/* Top bar with back button for sub-pages */}
        {tab === "more" && subPage && (
          <button
            onClick={() => setSubPage(null)}
            style={{
              background: "none", border: "none", color: colors.accent, cursor: "pointer",
              fontSize: 14, fontWeight: 600, marginBottom: 12, padding: 0, display: "flex",
              alignItems: "center", gap: 6, fontFamily: "inherit",
            }}
          >
            ← Back
          </button>
        )}
        {renderPage()}
      </div>

      <BottomNav active={tab} onChange={navigate} />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ROOT EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { user } = useAuth();
  return user ? <MainApp /> : <AuthScreen />;
}
