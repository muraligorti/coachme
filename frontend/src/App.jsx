import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ═══════════════════════════════════════════════════════════════════════
   FIT:OS NEXUS v6.0 — Production SaaS Platform
   
   SECURITY & ACCESS CONTROL:
   • Role-Based Access Control (RBAC): Admin, Coach, Client
   • Package-gated features (Starter/Pro/Elite for coaches)
   • JWT-ready auth with session management
   • Input sanitization, rate limiting, CSRF protection design
   • Encrypted storage abstraction layer
   
   COACH PLATFORM:
   • Easy registration with smart autocomplete
   • Client upload & management dashboard
   • AI-powered lead indicators (probable clients)
   • Package management with feature gating
   • Analytics & revenue tracking
   
   CLIENT PLATFORM:
   • Coach search & discovery marketplace
   • AI-matched coach recommendations
   • Progress tracking & workout history
   • Package-based feature access
   
   MOBILE DEPLOYMENT:
   • PWA (installable web app)
   • React Native / Expo guide
   • Android APK + iOS build paths
   ═══════════════════════════════════════════════════════════════════════ */

// ─── API CLIENT (talks to Express backend) ───────────────────────────
// All data flows through our backend: PostgreSQL, RBAC, JWT, rate limiting

const API_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:4000";

// Token storage (in-memory only — never localStorage)
let _accessToken = null;
let _refreshToken = null;

const api = {
  setTokens(access, refresh) { _accessToken = access; _refreshToken = refresh; },
  clearTokens() { _accessToken = null; _refreshToken = null; },

  async fetch(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (_accessToken) headers["Authorization"] = "Bearer " + _accessToken;

    let res = await fetch(API_URL + path, { ...options, headers });

    // Auto-refresh on 401
    if (res.status === 401 && _refreshToken) {
      const refreshRes = await fetch(API_URL + "/api/auth/refresh", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: _refreshToken }),
      });
      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        _accessToken = tokens.accessToken;
        _refreshToken = tokens.refreshToken;
        headers["Authorization"] = "Bearer " + _accessToken;
        res = await fetch(API_URL + path, { ...options, headers });
      } else {
        api.clearTokens();
        throw new Error("SESSION_EXPIRED");
      }
    }
    return res;
  },

  async get(path) { const r = await api.fetch(path); return r.json(); },
  async post(path, body) { const r = await api.fetch(path, { method: "POST", body: JSON.stringify(body) }); return r.json(); },
  async put(path, body) { const r = await api.fetch(path, { method: "PUT", body: JSON.stringify(body) }); return r.json(); },
  async patch(path, body) { const r = await api.fetch(path, { method: "PATCH", body: JSON.stringify(body) }); return r.json(); },
  async del(path) { const r = await api.fetch(path, { method: "DELETE" }); return r.json(); },
};

// ─── INPUT VALIDATION (client-side pre-check — server validates too) ─

const sanitize = (input) => {
  if (typeof input !== "string") return String(input || "");
  return input.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[c] || c)).trim().slice(0, 2000);
};
const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
const strongPassword = (p) => p && p.length >= 8 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p);

// ─── RBAC PERMISSION MATRIX ─────────────────────────────────────────

const ROLES = { ADMIN: "admin", COACH: "coach", CLIENT: "client" };

const PERMISSIONS = {
  // Admin permissions
  "admin.users.manage": [ROLES.ADMIN],
  "admin.platform.settings": [ROLES.ADMIN],
  "admin.analytics.full": [ROLES.ADMIN],
  "admin.packages.manage": [ROLES.ADMIN],
  "admin.reports.view": [ROLES.ADMIN],
  // Coach permissions
  "coach.clients.manage": [ROLES.ADMIN, ROLES.COACH],
  "coach.clients.upload": [ROLES.ADMIN, ROLES.COACH],
  "coach.plans.create": [ROLES.ADMIN, ROLES.COACH],
  "coach.analytics.own": [ROLES.ADMIN, ROLES.COACH],
  "coach.leads.view": [ROLES.ADMIN, ROLES.COACH],
  "coach.profile.edit": [ROLES.ADMIN, ROLES.COACH],
  "coach.billing.manage": [ROLES.ADMIN, ROLES.COACH],
  // Client permissions
  "client.workouts.view": [ROLES.ADMIN, ROLES.COACH, ROLES.CLIENT],
  "client.progress.view": [ROLES.ADMIN, ROLES.COACH, ROLES.CLIENT],
  "client.coaches.search": [ROLES.ADMIN, ROLES.CLIENT],
  "client.profile.edit": [ROLES.ADMIN, ROLES.CLIENT],
  "client.bookings.manage": [ROLES.ADMIN, ROLES.CLIENT],
};

const hasPermission = (role, permission) => {
  return (PERMISSIONS[permission] || []).includes(role);
};

// ─── PACKAGE / FEATURE GATING ────────────────────────────────────────

const COACH_PACKAGES = [
  {
    id: "starter", name: "Starter", price: 0, priceLabel: "Free",
    color: "#8b9dc3", icon: "🌱",
    maxClients: 5, features: ["Basic client management", "Workout plan builder", "Client progress view", "Email support"],
    gated: { aiCoaching: false, leadScoring: false, videoAnalysis: false, brandedApp: false, apiAccess: false, advancedAnalytics: false, bulkUpload: false, customBranding: false },
  },
  {
    id: "pro", name: "Pro", price: 49, priceLabel: "$49/mo",
    color: "#00e5ff", icon: "⚡",
    maxClients: 50, features: ["Everything in Starter", "AI-powered coaching", "Lead scoring & insights", "Camera form analysis", "Priority support", "Client bulk upload", "Advanced analytics"],
    gated: { aiCoaching: true, leadScoring: true, videoAnalysis: true, brandedApp: false, apiAccess: false, advancedAnalytics: true, bulkUpload: true, customBranding: false },
  },
  {
    id: "elite", name: "Elite", price: 149, priceLabel: "$149/mo",
    color: "#f59e0b", icon: "👑",
    maxClients: 999, features: ["Everything in Pro", "White-label branded app", "API access", "Custom branding", "Dedicated account manager", "Unlimited clients", "Revenue analytics"],
    gated: { aiCoaching: true, leadScoring: true, videoAnalysis: true, brandedApp: true, apiAccess: true, advancedAnalytics: true, bulkUpload: true, customBranding: true },
  },
];

const CLIENT_PACKAGES = [
  { id: "free", name: "Free", price: 0, priceLabel: "Free", color: "#8b9dc3", icon: "🌱", features: ["Browse coaches", "Basic workout tracking", "1 coach connection"], maxCoaches: 1 },
  { id: "premium", name: "Premium", price: 19, priceLabel: "$19/mo", color: "#00e5ff", icon: "⚡", features: ["Unlimited coaches", "AI form analysis", "Camera tracking", "Priority matching", "Advanced progress analytics"], maxCoaches: 999 },
];

const canAccess = (pkg, feature) => {
  const p = COACH_PACKAGES.find((x) => x.id === pkg) || COACH_PACKAGES[0];
  return p.gated[feature] === true;
};

// ─── SPECIALIZATION & AUTOCOMPLETE DATA ──────────────────────────────

const SPECIALIZATIONS = [
  "Strength & Conditioning", "Weight Loss", "Yoga & Flexibility", "HIIT & Cardio",
  "Bodybuilding", "CrossFit", "Post-Injury Rehab", "Senior Fitness",
  "Pre/Postnatal", "Sports Performance", "Martial Arts", "Nutrition Coaching",
  "Mental Wellness", "Functional Training", "Dance Fitness", "Endurance/Marathon",
];

const CERTIFICATIONS = [
  "NASM-CPT", "ACE-CPT", "ISSA-CPT", "NSCA-CSCS", "ACSM-EP", "CrossFit L1",
  "RYT-200 Yoga", "RYT-500 Yoga", "Precision Nutrition L1", "NASM-CES",
  "ACE Health Coach", "NASM-PES", "CSEP-CEP", "AFAA-GFI", "ISSA Nutritionist",
];

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia",
  "UAE", "Singapore", "Germany", "Brazil", "South Africa",
  "Netherlands", "France", "Japan", "South Korea", "Mexico",
];

const CITIES_BY_COUNTRY = {
  "India": ["Hyderabad", "Mumbai", "Delhi", "Bangalore", "Chennai", "Pune", "Kolkata", "Ahmedabad"],
  "United States": ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "San Francisco", "Miami", "Seattle"],
  "United Kingdom": ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Edinburgh", "Bristol"],
  "Canada": ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa"],
  "Australia": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  "UAE": ["Dubai", "Abu Dhabi", "Sharjah"],
};

const LANGUAGES = ["English", "Hindi", "Spanish", "French", "German", "Arabic", "Portuguese", "Japanese", "Korean", "Mandarin", "Tamil", "Telugu"];

// ─── AI AGENT (via backend proxy — API key never exposed) ────────────

async function aiCall(sys, msg, search = false) {
  try {
    const data = await api.post("/api/ai/chat", { system: sys, message: msg, search });
    return String(data.text || "");
  } catch { return ""; }
}

async function aiJSON(sys, msg, search = false) {
  const r = await aiCall(sys + "\nRESPOND ONLY WITH VALID JSON. No markdown, no backticks.", msg, search);
  try { return JSON.parse(r.replace(/```json|```/g, "").trim()); }
  catch { try { const m = r.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } }
}

// ─── DATA COMES FROM BACKEND API ─────────────────────────────────────
// No mock data — all fetched from PostgreSQL via Express API routes:
//   GET /api/coaches       → coach marketplace (cached in Redis)
//   GET /api/clients       → coach's client list
//   GET /api/leads         → AI-scored leads (Pro+ package)
//   GET /api/reports/*     → dashboard analytics
//   POST /api/ai/match     → AI coach matching
//   POST /api/ai/leads     → AI lead scoring

// ─── UI PRIMITIVES ───────────────────────────────────────────────────

const AC = "#00e5ff", AC2 = "#0057ff", DIM = "rgba(255,255,255,0.35)", BRD = "rgba(255,255,255,0.055)";
const WARN = "#fbbf24", OK = "#34d399", ERR = "#ef4444";

function Card({ children, style, glow, onClick, hv }) {
  const [h, sH] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => sH(true)} onMouseLeave={() => sH(false)}
      style={{ background: "rgba(255,255,255,0.022)", borderRadius: 16, padding: 20, border: "1px solid " + BRD, transition: "all 0.3s",
        ...(glow ? { boxShadow: "0 0 25px " + glow + "12", borderColor: glow + "28" } : {}),
        ...(onClick ? { cursor: "pointer" } : {}),
        ...(hv && h ? { borderColor: AC + "40", transform: "translateY(-2px)" } : {}),
        ...style }}>
      {children}
    </div>
  );
}

function Btn({ children, onClick, v = "primary", s = "md", disabled, style: sx, full }) {
  const cs = {
    primary: { background: "linear-gradient(135deg," + AC + "," + AC2 + ")", color: "#000" },
    secondary: { background: "rgba(255,255,255,0.05)", color: "#fff", border: "1px solid " + BRD },
    danger: { background: "rgba(239,68,68,0.1)", color: ERR, border: "1px solid rgba(239,68,68,0.2)" },
    success: { background: "rgba(52,211,153,0.1)", color: OK, border: "1px solid rgba(52,211,153,0.2)" },
    ghost: { background: "transparent", color: DIM },
    warn: { background: "rgba(251,191,36,0.1)", color: WARN, border: "1px solid rgba(251,191,36,0.2)" },
  };
  const ss = { sm: { padding: "6px 14px", fontSize: 11 }, md: { padding: "10px 20px", fontSize: 13 }, lg: { padding: "14px 30px", fontSize: 15 } };
  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ border: "none", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, borderRadius: 12, transition: "all 0.2s",
        opacity: disabled ? 0.4 : 1, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
        ...(full ? { width: "100%", justifyContent: "center" } : {}), ...ss[s], ...cs[v], ...sx }}>
      {children}
    </button>
  );
}

function Badge({ children, color = AC }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: color + "15", color, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, error, required, disabled, autoComplete }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>{label}{required && <span style={{ color: ERR }}> *</span>}</label>}
      <input type={type} value={value || ""} onChange={onChange} placeholder={placeholder} disabled={disabled}
        autoComplete={autoComplete || "off"}
        style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid " + (error ? ERR + "60" : BRD), background: disabled ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.03)", color: disabled ? DIM : "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", transition: "border-color 0.2s" }} />
      {error && <div style={{ fontSize: 10, color: ERR, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function Select({ label, value, onChange, options, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>{label}{required && <span style={{ color: ERR }}> *</span>}</label>}
      <select value={value || ""} onChange={onChange}
        style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid " + BRD, background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 13, fontFamily: "inherit", outline: "none", appearance: "none" }}>
        <option value="" style={{ background: "#111" }}>Select...</option>
        {(options || []).map((o) => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value} style={{ background: "#111" }}>{typeof o === "string" ? o : o.label}</option>)}
      </select>
    </div>
  );
}

function Chip({ label, selected, onClick, icon, color }) {
  return (
    <div onClick={onClick} style={{ padding: "7px 13px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s", fontSize: 12,
      fontWeight: selected ? 700 : 400, background: selected ? (color || AC) + "15" : "rgba(255,255,255,0.03)",
      border: "1px solid " + (selected ? (color || AC) + "50" : BRD), color: selected ? (color || AC) : "rgba(255,255,255,0.6)" }}>
      {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid " + BRD }}>
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{label}</span>
      <div onClick={onChange} style={{ width: 38, height: 20, borderRadius: 10, padding: 2, cursor: "pointer", background: value ? AC : "rgba(255,255,255,0.08)", transition: "all 0.3s" }}>
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "all 0.3s", transform: value ? "translateX(18px)" : "translateX(0)" }} />
      </div>
    </div>
  );
}

function Ring({ value, max, size = 80, color = AC, children, label }) {
  const r = (size - 6) / 2, c = 2 * Math.PI * r, p = Math.min((value || 0) / (max || 1), 1);
  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size} height={size} style={{ position: "absolute", transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={c} strokeDashoffset={c * (1 - p)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s" }} />
      </svg>
      <div style={{ textAlign: "center", zIndex: 1 }}>{children}{label && <div style={{ fontSize: 7, color: DIM, marginTop: 1, textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</div>}</div>
    </div>
  );
}

function FeatureGate({ feature, pkg, children, fallback }) {
  if (canAccess(pkg, feature)) return children;
  return fallback || (
    <Card style={{ textAlign: "center", padding: 30, opacity: 0.6 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Upgrade Required</div>
      <div style={{ fontSize: 11, color: DIM }}>This feature requires a Pro or Elite package</div>
    </Card>
  );
}

function Stat({ icon, label, value, color = AC }) {
  return (
    <Card style={{ padding: 14, textAlign: "center" }}>
      <div style={{ fontSize: 18, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Orbitron'" }}>{value}</div>
      <div style={{ fontSize: 8, color: DIM, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN APPLICATION
// ═══════════════════════════════════════════════════════════════════════

export default function App() {
  // ─── AUTH STATE ─────────────────────────────────────────────────
  const [screen, setScreen] = useState("loading"); // loading, auth, main
  const [authMode, setAuthMode] = useState("login"); // login, register, role-select
  const [authRole, setAuthRole] = useState(""); // coach, client
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  // ─── COACH REGISTRATION ────────────────────────────────────────
  const [regStep, setRegStep] = useState(0);
  const [coachReg, setCoachReg] = useState({
    name: "", phone: "", country: "", city: "", bio: "",
    specializations: [], certifications: [], languages: ["English"],
    experience: 1, pricePerSession: 30, online: true, inPerson: false,
    instagram: "", website: "", gym: "",
  });

  // ─── CLIENT REGISTRATION ───────────────────────────────────────
  const [clientReg, setClientReg] = useState({
    name: "", age: 25, gender: "other", height: 170, weight: 70,
    goals: [], conditions: [], country: "", city: "",
  });

  // ─── APP STATE ─────────────────────────────────────────────────
  const [tab, setTab] = useState("dashboard");
  const [navH, setNavH] = useState(null);
  const [coaches, setCoaches] = useState([]);
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState({ spec: "", city: "", priceMax: 100, ratingMin: 0 });
  const [aiLoading, setAiLoading] = useState(false);
  const [addClientMode, setAddClientMode] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", phone: "", age: 25, goals: [], conditions: [] });
  const [bulkUploadText, setBulkUploadText] = useState("");
  const [deployTab, setDeployTab] = useState("pwa");
  const [dashboardData, setDashboardData] = useState(null); // Reports from /api/reports

  // ─── LOAD STATE (from backend API) ─────────────────────────────
  const loadUserData = useCallback(async (userData) => {
    try {
      // Fetch coaches marketplace (public, cached in Redis)
      const coachData = await api.get("/api/coaches?limit=50");
      setCoaches((coachData.coaches || []).map((c) => ({
        ...c, name: c.displayName, photo: "💪", experience: c.experienceYears,
        price: c.pricePerSession, reviews: c.reviewCount, clients: c.totalClients,
        online: c.isOnline,
      })));
    } catch { setCoaches([]); }

    if (userData?.role === ROLES.COACH) {
      try {
        // Fetch coach's clients from PostgreSQL
        const clientData = await api.get("/api/clients");
        setClients(Array.isArray(clientData) ? clientData : []);
      } catch { setClients([]); }

      try {
        // Fetch AI-scored leads
        const leadData = await api.get("/api/leads");
        setLeads(Array.isArray(leadData) ? leadData : []);
      } catch { setLeads([]); }

      try {
        // Fetch dashboard report
        const report = await api.get("/api/reports/coach/dashboard");
        setDashboardData(report);
      } catch { setDashboardData(null); }
    }
  }, []);

  useEffect(() => {
    (async () => {
      // Try to restore session from stored tokens
      // In production, tokens come from httpOnly cookies set by the backend
      // For the preview, we check if API is reachable
      try {
        const me = await api.get("/api/auth/me");
        if (me?.user) {
          setUser({ ...me.user, ...me.profile });
          setSessionToken("active");
          await loadUserData(me.user);
          setScreen("main");
          return;
        }
      } catch {}
      setScreen("auth");
    })();
  }, [loadUserData]);

  // ─── AUTH HANDLERS (via backend /api/auth/*) ────────────────────
  const handleLogin = useCallback(async () => {
    setAuthError("");
    const e = sanitize(email).trim();
    const p = password;
    if (!validateEmail(e)) { setAuthError("Invalid email address"); return; }
    if (!p || p.length < 6) { setAuthError("Password must be at least 6 characters"); return; }
    setAuthLoading(true);
    try {
      const res = await fetch(API_URL + "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, password: p }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || "Login failed"); setAuthLoading(false); return; }
      // Store JWT tokens in memory (never localStorage)
      api.setTokens(data.accessToken, data.refreshToken);
      const userData = { ...data.user, ...data.profile };
      setUser(userData);
      setSessionToken(data.accessToken);
      await loadUserData(data.user);
      setScreen("main");
    } catch (err) {
      setAuthError(err.message === "SESSION_EXPIRED" ? "Session expired" : "Connection failed — is the backend running?");
    }
    setAuthLoading(false);
  }, [email, password, loadUserData]);

  const handleRegister = useCallback(async () => {
    setAuthError("");
    const e = sanitize(email).trim();
    if (!validateEmail(e)) { setAuthError("Invalid email address"); return; }
    if (!strongPassword(password)) { setAuthError("Password needs 8+ chars, uppercase, lowercase, and a number"); return; }
    if (password !== confirmPass) { setAuthError("Passwords don't match"); return; }
    setAuthLoading(true);
    // Pre-check: we'll actually register after role/profile selection
    // Just move to role selection for now
    setAuthMode("role-select");
    setAuthLoading(false);
  }, [email, password, confirmPass]);

  const completeRegistration = useCallback(async (role, profileData) => {
    const e = sanitize(email).trim();
    setAuthLoading(true);
    try {
      const res = await fetch(API_URL + "/api/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: e, password,
          role: role.toUpperCase(),
          profile: {
            displayName: profileData.name || profileData.displayName || "User",
            phone: profileData.phone,
            country: profileData.country,
            city: profileData.city,
            specializations: profileData.specializations,
            certifications: profileData.certifications,
            languages: profileData.languages,
            experienceYears: profileData.experience,
            pricePerSession: profileData.pricePerSession,
            bio: profileData.bio,
            instagram: profileData.instagram,
            website: profileData.website,
            gymName: profileData.gym,
            online: profileData.online,
            inPerson: profileData.inPerson,
            age: profileData.age,
            gender: profileData.gender,
            heightCm: profileData.height,
            weightKg: profileData.weight,
            fitnessGoals: profileData.goals,
            conditions: profileData.conditions,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error || "Registration failed"); setAuthLoading(false); return; }
      api.setTokens(data.accessToken, data.refreshToken);
      const userData = { ...data.user, ...profileData, role: role.toLowerCase() };
      setUser(userData);
      setSessionToken(data.accessToken);
      await loadUserData(data.user);
      setScreen("main");
    } catch (err) {
      setAuthError("Connection failed — is the backend running on " + API_URL + "?");
    }
    setAuthLoading(false);
  }, [email, password, loadUserData]);

  const logout = useCallback(async () => {
    try { await api.post("/api/auth/logout", {}); } catch {}
    api.clearTokens();
    setUser(null); setSessionToken("");
    setScreen("auth"); setAuthMode("login"); setTab("dashboard");
    setEmail(""); setPassword(""); setConfirmPass(""); setAuthError("");
    setRegStep(0);
    setCoachReg({ name: "", phone: "", country: "", city: "", bio: "", specializations: [], certifications: [], languages: ["English"], experience: 1, pricePerSession: 30, online: true, inPerson: false, instagram: "", website: "", gym: "" });
    setClientReg({ name: "", age: 25, gender: "other", height: 170, weight: 70, goals: [], conditions: [], country: "", city: "" });
  }, []);

  // ─── COACH: ADD CLIENT (via POST /api/clients) ──────────────────
  const addClient = useCallback(async () => {
    if (!newClient.name || !newClient.email) return;
    try {
      const result = await api.post("/api/clients", {
        name: sanitize(newClient.name),
        email: sanitize(newClient.email),
        phone: sanitize(newClient.phone || ""),
        age: newClient.age,
        goals: newClient.goals,
        conditions: newClient.conditions,
      });
      if (result.error) { alert(result.message || result.error); return; }
      // Refresh client list from backend
      const clientData = await api.get("/api/clients");
      setClients(Array.isArray(clientData) ? clientData : []);
      setNewClient({ name: "", email: "", phone: "", age: 25, goals: [], conditions: [] });
      setAddClientMode(false);
    } catch (err) { alert("Failed to add client: " + err.message); }
  }, [newClient]);

  const bulkUploadClients = useCallback(async () => {
    if (!bulkUploadText.trim()) return;
    const lines = bulkUploadText.trim().split("\n").filter(Boolean);
    const clientList = lines.map((line) => {
      const parts = line.split(",").map((s) => s.trim());
      return { name: parts[0] || "", email: parts[1] || "", phone: parts[2] || "", age: parseInt(parts[3]) || 25, goals: [], conditions: [] };
    });
    try {
      const result = await api.post("/api/clients/bulk", { clients: clientList });
      alert(`Uploaded: ${result.success || 0} success, ${result.failed || 0} failed`);
      // Refresh client list
      const clientData = await api.get("/api/clients");
      setClients(Array.isArray(clientData) ? clientData : []);
      setBulkUploadText("");
    } catch (err) { alert("Bulk upload failed: " + err.message); }
  }, [bulkUploadText]);

  // ─── AI FEATURES ───────────────────────────────────────────────
  const [aiMatchResults, setAiMatchResults] = useState(null);

  // ─── FILTERED COACHES ──────────────────────────────────────────
  const filteredCoaches = useMemo(() => {
    return coaches.filter((c) => {
      if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase()) && !c.specializations.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))) return false;
      if (searchFilters.spec && !c.specializations.includes(searchFilters.spec)) return false;
      if (searchFilters.city && c.city !== searchFilters.city) return false;
      if (c.price > searchFilters.priceMax) return false;
      if (parseFloat(c.rating) < searchFilters.ratingMin) return false;
      return true;
    });
  }, [coaches, searchQuery, searchFilters]);

  const searchCoachesAI = useCallback(async (query) => {
    if (!query.trim()) return;
    setAiLoading(true);
    try {
      const result = await api.post("/api/ai/match", {
        userProfile: { query: sanitize(query), goals: user?.fitnessGoals || user?.goals || [], city: user?.city },
        coaches: filteredCoaches.slice(0, 20).map((c) => ({ id: c.id, name: c.name || c.displayName, specializations: c.specializations, rating: c.rating, price: c.price || c.pricePerSession, city: c.city })),
      });
      setAiMatchResults(result);
    } catch { setAiMatchResults(null); }
    setAiLoading(false);
  }, [filteredCoaches, user]);

  // ─── NAVIGATION ────────────────────────────────────────────────
  const navItems = useMemo(() => {
    if (!user) return [];
    if (user.role === ROLES.COACH) return [
      { id: "dashboard", i: "⬡", l: "Dashboard" }, { id: "clients", i: "👥", l: "Clients" },
      { id: "leads", i: "🎯", l: "Leads" }, { id: "packages", i: "📦", l: "Package" },
      { id: "deploy", i: "🚀", l: "Deploy" }, { id: "settings", i: "⚙", l: "Settings" },
    ];
    if (user.role === ROLES.CLIENT) return [
      { id: "dashboard", i: "⬡", l: "Dashboard" }, { id: "coaches", i: "🔍", l: "Find Coach" },
      { id: "workouts", i: "💪", l: "Workouts" }, { id: "progress", i: "📊", l: "Progress" },
      { id: "settings", i: "⚙", l: "Settings" },
    ];
    return [
      { id: "dashboard", i: "⬡", l: "Dashboard" }, { id: "users", i: "👥", l: "Users" },
      { id: "analytics", i: "📊", l: "Analytics" }, { id: "settings", i: "⚙", l: "Settings" },
    ];
  }, [user]);

  // ═══ LOADING SCREEN ════════════════════════════════════════════
  if (screen === "loading") return (
    <div style={{ minHeight: "100vh", background: "#050509", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ fontFamily: "'Orbitron'", fontSize: 26, fontWeight: 900, background: "linear-gradient(135deg," + AC + "," + AC2 + ")", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>FIT:OS NEXUS</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 16, height: 16, border: "2px solid " + BRD, borderTopColor: AC, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <span style={{ fontSize: 12, color: DIM }}>Initializing secure session...</span>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  // ═══ AUTH SCREEN ═══════════════════════════════════════════════
  if (screen === "auth") {
    // Coach registration flow
    if (authMode === "coach-register") {
      const steps = [
        { t: "About You", i: "👤" }, { t: "Expertise", i: "🎓" },
        { t: "Services", i: "💼" }, { t: "Review", i: "✅" },
      ];
      const canNextReg = regStep === 0 ? (coachReg.name && coachReg.country && coachReg.city)
        : regStep === 1 ? (coachReg.specializations.length > 0)
        : regStep === 2 ? (coachReg.experience > 0)
        : true;

      return (
        <div style={{ minHeight: "100vh", background: "#050509", color: "#fff", fontFamily: "'Manrope',sans-serif" }}>
          <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "30px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
              <span onClick={() => setAuthMode("role-select")} style={{ cursor: "pointer", color: DIM, fontSize: 18 }}>←</span>
              <span style={{ fontFamily: "'Orbitron'", fontWeight: 900, fontSize: 14, color: AC }}>COACH REGISTRATION</span>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
              {steps.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= regStep ? AC : "rgba(255,255,255,0.06)", transition: "all 0.5s" }} />)}
            </div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>{steps[regStep].i}</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{steps[regStep].t}</div>
            </div>

            <Card style={{ marginBottom: 16 }}>
              {regStep === 0 && (<div>
                <Input label="Full Name" value={coachReg.name} onChange={(e) => setCoachReg((p) => ({ ...p, name: e.target.value }))} required autoComplete="name" placeholder="Your full name" />
                <Input label="Phone" value={coachReg.phone} onChange={(e) => setCoachReg((p) => ({ ...p, phone: e.target.value }))} type="tel" autoComplete="tel" placeholder="+91 98765 43210" />
                <Select label="Country" value={coachReg.country} onChange={(e) => setCoachReg((p) => ({ ...p, country: e.target.value, city: "" }))} options={COUNTRIES} required />
                {coachReg.country && <Select label="City" value={coachReg.city} onChange={(e) => setCoachReg((p) => ({ ...p, city: e.target.value }))} options={CITIES_BY_COUNTRY[coachReg.country] || []} required />}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Languages</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {LANGUAGES.slice(0, 8).map((l) => <Chip key={l} label={l} selected={coachReg.languages.includes(l)} onClick={() => setCoachReg((p) => ({ ...p, languages: p.languages.includes(l) ? p.languages.filter((x) => x !== l) : [...p.languages, l] }))} />)}
                  </div>
                </div>
              </div>)}

              {regStep === 1 && (<div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Specializations <span style={{ color: ERR }}>*</span></label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {SPECIALIZATIONS.map((s) => <Chip key={s} label={s} selected={coachReg.specializations.includes(s)} onClick={() => setCoachReg((p) => ({ ...p, specializations: p.specializations.includes(s) ? p.specializations.filter((x) => x !== s) : [...p.specializations, s] }))} />)}
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Certifications</label>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {CERTIFICATIONS.map((c) => <Chip key={c} label={c} selected={coachReg.certifications.includes(c)} onClick={() => setCoachReg((p) => ({ ...p, certifications: p.certifications.includes(c) ? p.certifications.filter((x) => x !== c) : [...p.certifications, c] }))} />)}
                  </div>
                </div>
              </div>)}

              {regStep === 2 && (<div>
                <Input label="Years of Experience" value={coachReg.experience} onChange={(e) => setCoachReg((p) => ({ ...p, experience: parseInt(e.target.value) || 0 }))} type="number" required />
                <Input label="Price per Session ($)" value={coachReg.pricePerSession} onChange={(e) => setCoachReg((p) => ({ ...p, pricePerSession: parseInt(e.target.value) || 0 }))} type="number" />
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Session Types</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Chip label="🌐 Online" selected={coachReg.online} onClick={() => setCoachReg((p) => ({ ...p, online: !p.online }))} />
                    <Chip label="📍 In-Person" selected={coachReg.inPerson} onClick={() => setCoachReg((p) => ({ ...p, inPerson: !p.inPerson }))} />
                  </div>
                </div>
                <Input label="Instagram" value={coachReg.instagram} onChange={(e) => setCoachReg((p) => ({ ...p, instagram: e.target.value }))} placeholder="@handle" autoComplete="off" />
                <Input label="Gym / Studio" value={coachReg.gym} onChange={(e) => setCoachReg((p) => ({ ...p, gym: e.target.value }))} placeholder="e.g., Gold's Gym Hyderabad" autoComplete="organization" />
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Bio</label>
                  <textarea value={coachReg.bio} onChange={(e) => setCoachReg((p) => ({ ...p, bio: e.target.value }))} placeholder="Tell clients about your coaching style, approach, and what makes you unique..."
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid " + BRD, background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none", minHeight: 80, resize: "vertical" }} />
                </div>
              </div>)}

              {regStep === 3 && (<div>
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg," + AC + "," + AC2 + ")", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 10px" }}>💪</div>
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{coachReg.name || "Coach"}</div>
                  <div style={{ fontSize: 11, color: DIM }}>{coachReg.city}, {coachReg.country}</div>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
                  {coachReg.specializations.map((s) => <Badge key={s} color={AC}>{s}</Badge>)}
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
                  {coachReg.certifications.map((c) => <Badge key={c} color={OK}>{c}</Badge>)}
                </div>
                <div style={{ textAlign: "center", fontSize: 12, color: DIM, marginBottom: 16 }}>
                  {coachReg.experience} yrs experience · ${coachReg.pricePerSession}/session · {coachReg.online ? "Online" : ""}{coachReg.online && coachReg.inPerson ? " + " : ""}{coachReg.inPerson ? "In-Person" : ""}
                </div>
                <div style={{ padding: 12, background: AC + "08", borderRadius: 12, fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
                  🌱 Starting on <strong style={{ color: AC }}>Free Starter Plan</strong> — upgrade anytime to unlock AI coaching, lead scoring, and more.
                </div>
              </div>)}
            </Card>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Btn v="ghost" onClick={() => regStep > 0 ? setRegStep((s) => s - 1) : setAuthMode("role-select")}>← Back</Btn>
              {regStep < 3 ? (
                <Btn onClick={() => setRegStep((s) => s + 1)} disabled={!canNextReg}>Next →</Btn>
              ) : (
                <Btn onClick={() => completeRegistration(ROLES.COACH, coachReg)} s="lg">Launch My Profile 🚀</Btn>
              )}
            </div>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:2px} button:hover{filter:brightness(1.1)} input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.2)}`}</style>
        </div>
      );
    }

    // Client registration flow
    if (authMode === "client-register") {
      const GOALS = ["Weight Loss", "Muscle Gain", "Flexibility", "Endurance", "Rehab", "Stress Relief", "General Fitness", "Sports Performance"];
      const CONDITIONS = ["None", "Hypertension", "Diabetes", "Asthma", "Back Pain", "Knee Issues", "Heart Condition", "Anxiety"];
      return (
        <div style={{ minHeight: "100vh", background: "#050509", color: "#fff", fontFamily: "'Manrope',sans-serif" }}>
          <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "30px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
              <span onClick={() => setAuthMode("role-select")} style={{ cursor: "pointer", color: DIM, fontSize: 18 }}>←</span>
              <span style={{ fontFamily: "'Orbitron'", fontWeight: 900, fontSize: 14, color: AC }}>CLIENT PROFILE</span>
            </div>
            <Card style={{ marginBottom: 16 }}>
              <Input label="Full Name" value={clientReg.name} onChange={(e) => setClientReg((p) => ({ ...p, name: e.target.value }))} required autoComplete="name" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Input label="Age" value={clientReg.age} onChange={(e) => setClientReg((p) => ({ ...p, age: parseInt(e.target.value) || 0 }))} type="number" autoComplete="off" />
                <Input label="Height (cm)" value={clientReg.height} onChange={(e) => setClientReg((p) => ({ ...p, height: parseInt(e.target.value) || 0 }))} type="number" autoComplete="off" />
                <Input label="Weight (kg)" value={clientReg.weight} onChange={(e) => setClientReg((p) => ({ ...p, weight: parseInt(e.target.value) || 0 }))} type="number" autoComplete="off" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Gender</label>
                <div style={{ display: "flex", gap: 6 }}>{["Male", "Female", "Other"].map((g) => <Chip key={g} label={g} selected={clientReg.gender === g.toLowerCase()} onClick={() => setClientReg((p) => ({ ...p, gender: g.toLowerCase() }))} />)}</div>
              </div>
              <Select label="Country" value={clientReg.country} onChange={(e) => setClientReg((p) => ({ ...p, country: e.target.value, city: "" }))} options={COUNTRIES} />
              {clientReg.country && <Select label="City" value={clientReg.city} onChange={(e) => setClientReg((p) => ({ ...p, city: e.target.value }))} options={CITIES_BY_COUNTRY[clientReg.country] || []} />}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Fitness Goals</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{GOALS.map((g) => <Chip key={g} label={g} selected={clientReg.goals.includes(g)} onClick={() => setClientReg((p) => ({ ...p, goals: p.goals.includes(g) ? p.goals.filter((x) => x !== g) : [...p.goals, g] }))} />)}</div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, color: DIM, marginBottom: 5, fontWeight: 600 }}>Medical Conditions</label>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{CONDITIONS.map((c) => <Chip key={c} label={c} selected={clientReg.conditions.includes(c)} onClick={() => setClientReg((p) => ({ ...p, conditions: p.conditions.includes(c) ? p.conditions.filter((x) => x !== c) : [...p.conditions, c] }))} />)}</div>
              </div>
            </Card>
            <Btn full s="lg" onClick={() => completeRegistration(ROLES.CLIENT, clientReg)} disabled={!clientReg.name}>Find My Coach →</Btn>
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:2px} button:hover{filter:brightness(1.1)} input::placeholder{color:rgba(255,255,255,0.2)}`}</style>
        </div>
      );
    }

    // Role selection
    if (authMode === "role-select") {
      return (
        <div style={{ minHeight: "100vh", background: "#050509", color: "#fff", fontFamily: "'Manrope',sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
          <div style={{ maxWidth: 520, padding: 20, textAlign: "center" }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 20, fontWeight: 900, background: "linear-gradient(135deg," + AC + "," + AC2 + ")", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6 }}>FIT:OS NEXUS</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>I am a...</div>
            <div style={{ fontSize: 11, color: DIM, marginBottom: 24 }}>Choose your role to customize your experience</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
              <Card hv onClick={() => setAuthMode("coach-register")} glow={AC2} style={{ padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🏋️</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Fitness Coach</div>
                <div style={{ fontSize: 11, color: DIM, lineHeight: 1.6 }}>Manage clients, AI lead scoring, branded app, workout plans, analytics</div>
                <div style={{ marginTop: 12 }}><Badge color={AC}>Start Free</Badge></div>
              </Card>
              <Card hv onClick={() => setAuthMode("client-register")} glow={OK} style={{ padding: 28, textAlign: "center" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>💪</div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Client</div>
                <div style={{ fontSize: 11, color: DIM, lineHeight: 1.6 }}>Find coaches, AI workouts, camera tracking, progress analytics</div>
                <div style={{ marginTop: 12 }}><Badge color={OK}>Start Free</Badge></div>
              </Card>
            </div>
            <Btn v="ghost" onClick={() => setAuthMode("login")}>← Back to Login</Btn>
          </div>
          <style>{`*{box-sizing:border-box;margin:0;padding:0} button:hover{filter:brightness(1.1)}`}</style>
        </div>
      );
    }

    // Login / Register form
    return (
      <div style={{ minHeight: "100vh", background: "#050509", color: "#fff", fontFamily: "'Manrope',sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 30% 20%,rgba(0,100,255,0.06),transparent 60%)" }} />
        <div style={{ maxWidth: 400, width: "100%", padding: 20 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 28, fontWeight: 900, background: "linear-gradient(135deg," + AC + "," + AC2 + ")", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 6 }}>FIT:OS NEXUS</div>
            <div style={{ fontSize: 12, color: DIM }}>AI-Powered Fitness Platform</div>
          </div>
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              <Btn v={authMode === "login" ? "primary" : "secondary"} full onClick={() => { setAuthMode("login"); setAuthError(""); }}>Sign In</Btn>
              <Btn v={authMode === "register" ? "primary" : "secondary"} full onClick={() => { setAuthMode("register"); setAuthError(""); }}>Create Account</Btn>
            </div>
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@email.com" required autoComplete="email" />
            <Input label="Password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" required autoComplete={authMode === "login" ? "current-password" : "new-password"} />
            {authMode === "register" && <Input label="Confirm Password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} type="password" placeholder="••••••••" required autoComplete="new-password" />}
            {authError && <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", borderRadius: 10, borderLeft: "3px solid " + ERR, fontSize: 11, color: ERR, marginBottom: 12 }}>{authError}</div>}
            <Btn full s="lg" onClick={authMode === "login" ? handleLogin : handleRegister} disabled={authLoading}>
              {authLoading ? "⟳ " : ""}{authMode === "login" ? "Sign In" : "Continue →"}
            </Btn>
            {authMode === "register" && <div style={{ fontSize: 10, color: DIM, marginTop: 8, textAlign: "center" }}>Password: 8+ chars, uppercase, lowercase, number</div>}
          </Card>
          <Card style={{ padding: 12, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: DIM }}>🔒 End-to-end encrypted · RBAC secured · GDPR compliant</div>
          </Card>
        </div>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box;margin:0;padding:0} button:hover{filter:brightness(1.1)} input::placeholder{color:rgba(255,255,255,0.2)}`}</style>
      </div>
    );
  }

  // ═══ MAIN APP ══════════════════════════════════════════════════
  const pkg = user?.package || "starter";
  const pkgData = COACH_PACKAGES.find((p) => p.id === pkg) || COACH_PACKAGES[0];

  return (
    <div style={{ minHeight: "100vh", background: "#050509", color: "#fff", fontFamily: "'Manrope',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Manrope:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 15% 0%,rgba(0,100,255,0.05),transparent 55%)" }} />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(24px)", background: "rgba(5,5,9,0.92)", borderBottom: "1px solid " + BRD, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "'Orbitron'", fontWeight: 900, fontSize: 14, background: "linear-gradient(135deg," + AC + "," + AC2 + ")", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>NEXUS</span>
          <Badge color={user?.role === ROLES.COACH ? AC : user?.role === ROLES.CLIENT ? OK : WARN}>
            {user?.role === ROLES.COACH ? "🏋️ Coach" : user?.role === ROLES.CLIENT ? "💪 Client" : "⚙ Admin"}
          </Badge>
          {user?.role === ROLES.COACH && <Badge color={pkgData.color}>{pkgData.icon + " " + pkgData.name}</Badge>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{user?.name || user?.email}</span>
          <Btn v="ghost" s="sm" onClick={logout}>Logout</Btn>
        </div>
      </header>

      {/* Nav */}
      <nav style={{ display: "flex", justifyContent: "center", gap: 1, padding: "5px 8px", background: "rgba(0,0,0,0.3)", overflowX: "auto" }}>
        {navItems.map((n) => (
          <div key={n.id} onClick={() => setTab(n.id)} onMouseEnter={() => setNavH(n.id)} onMouseLeave={() => setNavH(null)}
            style={{ padding: "5px 13px", borderRadius: 10, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
              background: tab === n.id ? AC + "12" : navH === n.id ? "rgba(255,255,255,0.02)" : "transparent",
              color: tab === n.id ? AC : DIM, fontSize: 11, fontWeight: tab === n.id ? 700 : 400 }}>
            {n.i + " " + n.l}
          </div>
        ))}
      </nav>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 90px" }}>

        {/* ═══ COACH DASHBOARD ═══ */}
        {user?.role === ROLES.COACH && tab === "dashboard" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>Welcome, {sanitize(user.name || "Coach")} 👋</div>
              <div style={{ fontSize: 11, color: DIM }}>{pkgData.name} Plan · {clients.length}/{pkgData.maxClients} clients</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8, marginBottom: 18 }}>
              <Stat icon="👥" label="Clients" value={dashboardData?.overview?.activeClients ?? clients.length} color={AC} />
              <Stat icon="🎯" label="Hot Leads" value={dashboardData?.leads?.hot ?? leads.filter((l) => l.matchScore > 80).length} color={WARN} />
              <Stat icon="⭐" label="Rating" value={dashboardData?.ratings?.average || user.rating || "--"} color={OK} />
              <Stat icon="💰" label="Monthly" value={"$" + (dashboardData?.revenue?.thisMonth || 0)} color="#a78bfa" />
            </div>

            {/* Growth Indicators */}
            {dashboardData && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {dashboardData.overview?.clientGrowth !== undefined && <Badge color={dashboardData.overview.clientGrowth >= 0 ? OK : ERR}>{dashboardData.overview.clientGrowth >= 0 ? "↑" : "↓"} {Math.abs(dashboardData.overview.clientGrowth)}% clients</Badge>}
                {dashboardData.revenue?.growth !== undefined && <Badge color={dashboardData.revenue.growth >= 0 ? OK : ERR}>{dashboardData.revenue.growth >= 0 ? "↑" : "↓"} {Math.abs(dashboardData.revenue.growth)}% revenue</Badge>}
                {dashboardData.leads?.conversionRate !== undefined && <Badge color={AC}>🎯 {dashboardData.leads.conversionRate}% conversion</Badge>}
                {dashboardData.overview?.bookingsThisMonth !== undefined && <Badge>📅 {dashboardData.overview.bookingsThisMonth} bookings this month</Badge>}
              </div>
            )}

            {/* Quick Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 18 }}>
              <Card hv onClick={() => { setTab("clients"); setAddClientMode(true); }} style={{ textAlign: "center", padding: 16 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>➕</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Add Client</div>
              </Card>
              <Card hv onClick={() => setTab("leads")} style={{ textAlign: "center", padding: 16 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>🎯</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>View Leads</div>
                {leads.filter((l) => l.matchScore > 80).length > 0 && <Badge color={ERR}>{leads.filter((l) => l.matchScore > 80).length} hot</Badge>}
              </Card>
              <Card hv onClick={() => setTab("packages")} style={{ textAlign: "center", padding: 16 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>📦</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Upgrade</div>
              </Card>
            </div>

            {/* Recent Clients */}
            <Card style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Recent Clients</div>
              {clients.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: DIM, fontSize: 12 }}>No clients yet. Add your first client to get started!</div>
              ) : clients.slice(-5).reverse().map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid " + BRD }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: AC + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: AC }}>{(c.name || "?")[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{sanitize(c.name)}</div>
                    <div style={{ fontSize: 10, color: DIM }}>{c.email} · {c.lastActive}</div>
                  </div>
                  <Badge color={c.status === "active" ? OK : DIM}>{c.status}</Badge>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ═══ COACH: CLIENTS TAB ═══ */}
        {user?.role === ROLES.COACH && tab === "clients" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>Clients</div>
                <div style={{ fontSize: 11, color: DIM }}>{clients.length}/{pkgData.maxClients} slots used</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Btn s="sm" onClick={() => setAddClientMode(true)}>+ Add Client</Btn>
                {canAccess(pkg, "bulkUpload") && <Btn v="secondary" s="sm" onClick={() => setBulkUploadText(" ")}>📤 Bulk Upload</Btn>}
              </div>
            </div>

            {/* Add Client Form */}
            {addClientMode && (
              <Card glow={AC} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add New Client</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <Input label="Name" value={newClient.name} onChange={(e) => setNewClient((p) => ({ ...p, name: e.target.value }))} required autoComplete="off" />
                  <Input label="Email" value={newClient.email} onChange={(e) => setNewClient((p) => ({ ...p, email: e.target.value }))} type="email" required autoComplete="off" />
                  <Input label="Phone" value={newClient.phone} onChange={(e) => setNewClient((p) => ({ ...p, phone: e.target.value }))} type="tel" autoComplete="off" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={addClient} disabled={!newClient.name || !newClient.email || clients.length >= pkgData.maxClients}>Add Client</Btn>
                  <Btn v="ghost" onClick={() => setAddClientMode(false)}>Cancel</Btn>
                  {clients.length >= pkgData.maxClients && <span style={{ fontSize: 11, color: WARN, alignSelf: "center" }}>Client limit reached — upgrade plan</span>}
                </div>
              </Card>
            )}

            {/* Bulk Upload */}
            {bulkUploadText !== "" && canAccess(pkg, "bulkUpload") && (
              <Card glow="#a78bfa" style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>📤 Bulk Upload Clients</div>
                <div style={{ fontSize: 10, color: DIM, marginBottom: 8 }}>One client per line: Name, Email, Phone, Age</div>
                <textarea value={bulkUploadText === " " ? "" : bulkUploadText} onChange={(e) => setBulkUploadText(e.target.value)} placeholder={"Rahul Kumar, rahul@email.com, +91 9876543210, 28\nAisha Khan, aisha@email.com, +91 8765432109, 32"}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: "1px solid " + BRD, background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 12, fontFamily: "monospace", outline: "none", minHeight: 100, resize: "vertical" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <Btn onClick={bulkUploadClients}>Upload All</Btn>
                  <Btn v="ghost" onClick={() => setBulkUploadText("")}>Cancel</Btn>
                </div>
              </Card>
            )}

            {/* Client List */}
            {clients.map((c) => (
              <Card key={c.id} style={{ marginBottom: 6, padding: 14, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: AC + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: AC }}>{(c.name || "?")[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{sanitize(c.name)}</div>
                  <div style={{ fontSize: 10, color: DIM }}>{c.email}{c.phone ? " · " + c.phone : ""} · Added {new Date(c.addedAt).toLocaleDateString()}</div>
                </div>
                <Badge color={c.status === "active" ? OK : DIM}>{c.status}</Badge>
                <Btn v="danger" s="sm" onClick={async () => { try { await api.del("/api/clients/" + c.id); setClients((prev) => prev.filter((x) => x.id !== c.id)); } catch {} }}>✕</Btn>
              </Card>
            ))}
            {clients.length === 0 && <Card style={{ textAlign: "center", padding: 40 }}><div style={{ fontSize: 36, marginBottom: 8 }}>👥</div><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No clients yet</div><div style={{ fontSize: 12, color: DIM }}>Add your first client to start managing their fitness journey</div></Card>}
          </div>
        )}

        {/* ═══ COACH: LEADS TAB ═══ */}
        {user?.role === ROLES.COACH && tab === "leads" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>AI Lead Scoring</div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 18 }}>Potential clients matched to your specializations using AI</div>

            <FeatureGate feature="leadScoring" pkg={pkg}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
                {leads.sort((a, b) => b.score - a.score).map((lead) => (
                  <Card key={lead.id} glow={lead.matchScore > 85 ? OK : lead.matchScore > 70 ? WARN : undefined} style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{lead.name}</div>
                        <div style={{ fontSize: 10, color: DIM }}>{lead.location} · {lead.lastActive}</div>
                      </div>
                      <Ring value={lead.matchScore} max={100} size={44} color={lead.matchScore > 85 ? OK : lead.matchScore > 70 ? WARN : ERR}>
                        <div style={{ fontSize: 10, fontWeight: 800 }}>{lead.matchScore}</div>
                      </Ring>
                    </div>
                    <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                      <Badge color={lead.type === "High Intent" ? OK : lead.type === "Warm Lead" ? WARN : AC}>{lead.type}</Badge>
                      <Badge>{lead.goal}</Badge>
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", marginBottom: 8 }}>{lead.intent}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn s="sm" v="success">Reach Out</Btn>
                      <Btn s="sm" v="ghost">Dismiss</Btn>
                    </div>
                  </Card>
                ))}
              </div>
            </FeatureGate>
          </div>
        )}

        {/* ═══ COACH: PACKAGES TAB ═══ */}
        {user?.role === ROLES.COACH && tab === "packages" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Coach Packages</div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 18 }}>Upgrade to unlock AI features, more clients, and lead scoring</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
              {COACH_PACKAGES.map((p) => (
                <Card key={p.id} glow={pkg === p.id ? p.color : undefined} style={{ padding: 24, textAlign: "center", border: pkg === p.id ? "2px solid " + p.color + "60" : "1px solid " + BRD }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{p.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: p.color, marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Orbitron'", marginBottom: 4 }}>{p.priceLabel}</div>
                  <div style={{ fontSize: 11, color: DIM, marginBottom: 14 }}>Up to {p.maxClients === 999 ? "unlimited" : p.maxClients} clients</div>
                  {p.features.map((f) => <div key={f} style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>✓ {f}</div>)}
                  <div style={{ marginTop: 14 }}>
                    {pkg === p.id ? <Badge color={p.color}>Current Plan</Badge> : <Btn full v={p.id === "elite" ? "warn" : "primary"}>Upgrade to {p.name}</Btn>}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ═══ CLIENT DASHBOARD ═══ */}
        {user?.role === ROLES.CLIENT && tab === "dashboard" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 2 }}>Welcome, {sanitize(user.name || "there")} 💪</div>
              <div style={{ fontSize: 11, color: DIM }}>{user.package === "premium" ? "Premium Member" : "Free Plan"}</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 8, marginBottom: 18 }}>
              <Stat icon="🏋️" label="Workouts" value="0" color={AC} />
              <Stat icon="🔥" label="Streak" value="0d" color={WARN} />
              <Stat icon="⭐" label="Form" value="--" color={OK} />
              <Stat icon="📈" label="Progress" value="--" color="#a78bfa" />
            </div>
            <Card glow={AC2} style={{ marginBottom: 14, textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Find Your Coach</div>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 12 }}>AI-matched coaches based on your goals and location</div>
              <Btn s="lg" onClick={() => setTab("coaches")}>Browse Coaches →</Btn>
            </Card>
          </div>
        )}

        {/* ═══ CLIENT: FIND COACH ═══ */}
        {user?.role === ROLES.CLIENT && tab === "coaches" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Find a Coach</div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 14 }}>AI-matched coaches for your goals</div>

            {/* AI Search */}
            <Card style={{ marginBottom: 14, padding: 14 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") searchCoachesAI(searchQuery); }}
                  placeholder="Describe what you're looking for... (e.g., 'weight loss coach in Hyderabad who speaks Telugu')"
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 12, border: "1px solid " + BRD, background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
                <Btn onClick={() => searchCoachesAI(searchQuery)} disabled={aiLoading}>{aiLoading ? "⟳" : "🤖 AI Search"}</Btn>
              </div>
            </Card>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <Select label="" value={searchFilters.spec} onChange={(e) => setSearchFilters((p) => ({ ...p, spec: e.target.value }))} options={[{ value: "", label: "All Specializations" }, ...SPECIALIZATIONS.map((s) => ({ value: s, label: s }))]} />
              <Select label="" value={searchFilters.city} onChange={(e) => setSearchFilters((p) => ({ ...p, city: e.target.value }))} options={[{ value: "", label: "All Cities" }, ...(CITIES_BY_COUNTRY[user?.country || "India"] || []).map((c) => ({ value: c, label: c }))]} />
            </div>

            {/* AI Match Results */}
            {aiMatchResults?.matches && (
              <Card glow={AC2} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: AC, marginBottom: 8 }}>🤖 AI Recommendations</div>
                {aiMatchResults.matches.map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < aiMatchResults.matches.length - 1 ? "1px solid " + BRD : "none" }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: AC, fontFamily: "'Orbitron'", width: 24 }}>#{m.rank}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: DIM }}>{m.reason}</div>
                    </div>
                    <Badge color={OK}>{m.matchScore}% match</Badge>
                  </div>
                ))}
              </Card>
            )}

            {/* Coach Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 10 }}>
              {filteredCoaches.map((c) => (
                <Card key={c.id} hv onClick={() => setSelectedCoach(c)} style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg," + AC + "," + AC2 + ")", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{c.photo}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                        {c.verified && <span style={{ fontSize: 10, color: AC }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 10, color: DIM }}>{c.city} · {c.experience}yr exp</div>
                    </div>
                    {c.online && <Badge color={OK}>● Online</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                    {c.specializations.map((s) => <Badge key={s} color={AC}>{s}</Badge>)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 11, color: WARN }}>⭐ {c.rating} ({c.reviews})</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: AC, fontFamily: "'Orbitron'" }}>${c.price}<span style={{ fontSize: 9, color: DIM }}>/session</span></div>
                  </div>
                </Card>
              ))}
            </div>

            {/* Coach Detail Modal */}
            {selectedCoach && (
              <div onClick={() => setSelectedCoach(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <Card onClick={(e) => e.stopPropagation()} glow={AC} style={{ maxWidth: 480, width: "100%", maxHeight: "80vh", overflowY: "auto" }}>
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", background: "linear-gradient(135deg," + AC + "," + AC2 + ")", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 10px" }}>{selectedCoach.photo}</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedCoach.name} {selectedCoach.verified && <span style={{ color: AC }}>✓</span>}</div>
                    <div style={{ fontSize: 11, color: DIM }}>{selectedCoach.city}, {selectedCoach.country} · {selectedCoach.experience} yrs</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", marginBottom: 10 }}>
                    {selectedCoach.specializations.map((s) => <Badge key={s}>{s}</Badge>)}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center", marginBottom: 12 }}>
                    {selectedCoach.certifications.map((c) => <Badge key={c} color={OK}>{c}</Badge>)}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7, marginBottom: 14, textAlign: "center" }}>{selectedCoach.bio}</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 14 }}>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: WARN }}>⭐ {selectedCoach.rating}</div><div style={{ fontSize: 9, color: DIM }}>{selectedCoach.reviews} reviews</div></div>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: AC }}>{selectedCoach.clients}</div><div style={{ fontSize: 9, color: DIM }}>clients</div></div>
                    <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 800, color: OK }}>${selectedCoach.price}</div><div style={{ fontSize: 9, color: DIM }}>per session</div></div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn full s="lg">Book Session</Btn>
                    <Btn v="secondary" full s="lg">Message</Btn>
                  </div>
                  <div style={{ textAlign: "center", marginTop: 10 }}><Btn v="ghost" s="sm" onClick={() => setSelectedCoach(null)}>Close</Btn></div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ═══ COACH: DEPLOY TAB ═══ */}
        {tab === "deploy" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Deploy to Production</div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 18 }}>Launch your fitness platform on Android, iOS, and web</div>

            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { id: "pwa", icon: "🌐", label: "PWA (Web App)" },
                { id: "android", icon: "🤖", label: "Android APK" },
                { id: "ios", icon: "🍎", label: "iOS App" },
                { id: "security", icon: "🔐", label: "Security" },
                { id: "backend", icon: "⚙", label: "Backend API" },
              ].map((t) => <Chip key={t.id} icon={t.icon} label={t.label} selected={deployTab === t.id} onClick={() => setDeployTab(t.id)} />)}
            </div>

            {deployTab === "pwa" && (<div>
              <Card style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🌐 Progressive Web App</div>
                <div style={{ fontSize: 11, color: DIM, lineHeight: 1.7, marginBottom: 12 }}>Installable on any device from the browser. Works offline. Auto-updates. No app store needed.</div>
                {[
                  { cmd: "npx create-vite fitos-nexus --template react\ncd fitos-nexus && npm install", desc: "Create project" },
                  { cmd: "npm install vite-plugin-pwa -D", desc: "Add PWA plugin" },
                  { cmd: `// vite.config.js\nimport { VitePWA } from 'vite-plugin-pwa'\nexport default {\n  plugins: [react(), VitePWA({\n    registerType: 'autoUpdate',\n    manifest: {\n      name: 'FIT:OS NEXUS',\n      short_name: 'NEXUS',\n      theme_color: '#050509',\n      icons: [{ src: '/icon-192.png', sizes: '192x192' }]\n    }\n  })]\n}`, desc: "Configure PWA manifest" },
                  { cmd: "npm run build && npx serve dist", desc: "Build & serve" },
                ].map((s, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: DIM, marginBottom: 4 }}>{s.desc}</div>
                    <pre style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", borderRadius: 10, border: "1px solid " + BRD, fontSize: 11, color: AC, fontFamily: "'Fira Code',monospace", whiteSpace: "pre-wrap", margin: 0 }}>{s.cmd}</pre>
                  </div>
                ))}
              </Card>
            </div>)}

            {deployTab === "android" && (<div>
              <Card style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🤖 Android Deployment</div>
                {[
                  { cmd: "npx create-expo-app FitosNexus --template blank\ncd FitosNexus", desc: "Option A: Expo (easiest)" },
                  { cmd: "npx expo install expo-camera expo-sensors expo-haptics expo-speech", desc: "Install native modules" },
                  { cmd: "eas build --platform android --profile production", desc: "Build APK/AAB for Play Store" },
                  { cmd: "# Option B: Capacitor (wrap existing web app)\nnpm install @capacitor/core @capacitor/cli\nnpx cap init FitosNexus com.fitos.nexus\nnpx cap add android\nnpm run build && npx cap sync\nnpx cap open android", desc: "Or use Capacitor to wrap the web app" },
                ].map((s, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: DIM, marginBottom: 4 }}>{s.desc}</div>
                    <pre style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", borderRadius: 10, border: "1px solid " + BRD, fontSize: 11, color: AC, fontFamily: "'Fira Code',monospace", whiteSpace: "pre-wrap", margin: 0 }}>{s.cmd}</pre>
                  </div>
                ))}
              </Card>
            </div>)}

            {deployTab === "ios" && (<div>
              <Card style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>🍎 iOS App Store</div>
                <div style={{ fontSize: 11, color: DIM, lineHeight: 1.7, marginBottom: 12 }}>Requires macOS with Xcode. Apple Developer account ($99/yr).</div>
                {[
                  { cmd: "eas build --platform ios --profile production", desc: "Build with Expo EAS (no Mac needed for build)" },
                  { cmd: "eas submit --platform ios", desc: "Submit to App Store" },
                  { cmd: "# Or with Capacitor:\nnpx cap add ios\nnpx cap sync\nnpx cap open ios  # Opens Xcode", desc: "Or use Capacitor" },
                ].map((s, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color: DIM, marginBottom: 4 }}>{s.desc}</div>
                    <pre style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", borderRadius: 10, border: "1px solid " + BRD, fontSize: 11, color: AC, fontFamily: "'Fira Code',monospace", whiteSpace: "pre-wrap", margin: 0 }}>{s.cmd}</pre>
                  </div>
                ))}
              </Card>
            </div>)}

            {deployTab === "security" && (<div>
              <Card style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🔐 Security Architecture</div>
                {[
                  { t: "Authentication", d: "JWT tokens with refresh rotation. bcrypt password hashing (cost factor 12). Rate-limited login (5 attempts/min). HttpOnly secure cookies.", c: OK },
                  { t: "RBAC", d: "Role-based middleware on every API route. Permission matrix: Admin > Coach > Client. Resource-level access control (coach can only see own clients).", c: AC },
                  { t: "Input Sanitization", d: "All user inputs sanitized against XSS. Parameterized SQL queries (no injection). Content Security Policy headers. File upload validation.", c: WARN },
                  { t: "Data Encryption", d: "TLS 1.3 in transit. AES-256 for medical data at rest. API keys in environment variables only. No secrets in frontend code.", c: "#a78bfa" },
                  { t: "CSRF Protection", d: "CSRF tokens on all state-changing requests. SameSite cookie attribute. Origin header validation.", c: ERR },
                  { t: "Compliance", d: "GDPR: data export/deletion. HIPAA: medical data encryption. SOC 2: audit logging. Privacy policy + ToS required.", c: "#ec4899" },
                ].map((item) => (
                  <div key={item.t} style={{ padding: "10px 14px", background: item.c + "06", borderRadius: 10, borderLeft: "3px solid " + item.c, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: item.c }}>{item.t}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{item.d}</div>
                  </div>
                ))}
              </Card>
            </div>)}

            {deployTab === "backend" && (<div>
              <Card style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>⚙ Backend API Architecture</div>
                {[
                  { cmd: `// Recommended stack:
// Node.js + Express/Fastify
// PostgreSQL + Prisma ORM
// Redis for sessions & rate limiting
// S3/Cloudflare R2 for file storage

npm init -y
npm install express @prisma/client bcryptjs jsonwebtoken
npm install helmet cors express-rate-limit
npx prisma init`, desc: "Initialize backend" },
                  { cmd: `// prisma/schema.prisma
model User {
  id       String   @id @default(cuid())
  email    String   @unique
  password String
  role     Role     @default(CLIENT)
  package  String   @default("free")
  profile  Json?
  clients  Client[] @relation("CoachClients")
}

enum Role { ADMIN COACH CLIENT }

model Client {
  id      String @id @default(cuid())
  name    String
  email   String
  coachId String
  coach   User   @relation("CoachClients", fields: [coachId])
}`, desc: "Database schema" },
                  { cmd: `// middleware/auth.js
const jwt = require('jsonwebtoken');
module.exports = (roles = []) => (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Auth required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (roles.length && !roles.includes(decoded.role))
      return res.status(403).json({ error: 'Forbidden' });
    req.user = decoded;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

// Usage: app.get('/api/clients', auth(['coach','admin']), handler)`, desc: "RBAC middleware" },
                ].map((s, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: DIM, marginBottom: 4 }}>{s.desc}</div>
                    <pre style={{ padding: "10px 14px", background: "rgba(0,0,0,0.4)", borderRadius: 10, border: "1px solid " + BRD, fontSize: 10, color: AC, fontFamily: "'Fira Code',monospace", whiteSpace: "pre-wrap", margin: 0, maxHeight: 200, overflowY: "auto" }}>{s.cmd}</pre>
                  </div>
                ))}
              </Card>
            </div>)}
          </div>
        )}

        {/* ═══ SETTINGS ═══ */}
        {tab === "settings" && (
          <div style={{ animation: "fadeIn 0.4s ease" }}>
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Settings</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Account</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Email: {user?.email}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>Role: <Badge color={user?.role === ROLES.COACH ? AC : OK}>{user?.role}</Badge></div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>Joined: {new Date(user?.createdAt || Date.now()).toLocaleDateString()}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn v="danger" s="sm" onClick={logout}>Sign Out</Btn>
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Security</div>
                <div style={{ fontSize: 11, color: DIM, lineHeight: 1.7 }}>
                  🔒 Auth: JWT + bcrypt (backend)<br />
                  🛡️ RBAC: {user?.role} role enforced<br />
                  📡 API: {API_URL}<br />
                  🗄️ DB: PostgreSQL + Prisma<br />
                  ⚡ Cache: Redis sessions<br />
                  🔐 Medical: AES-256 encrypted
                </div>
              </Card>
            </div>
            <Card style={{ marginTop: 12, textAlign: "center", padding: 12 }}>
              <div style={{ fontFamily: "'Orbitron'", fontWeight: 900, fontSize: 12, color: AC }}>FIT:OS NEXUS v6.1</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", marginTop: 2 }}>PostgreSQL · Express · RBAC · JWT · Redis · AI Proxy · Reports</div>
            </Card>
          </div>
        )}

        {/* ═══ CLIENT: WORKOUTS & PROGRESS (placeholder tabs) ═══ */}
        {user?.role === ROLES.CLIENT && tab === "workouts" && (
          <div style={{ animation: "fadeIn 0.4s ease", textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>💪</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Workouts</div>
            <div style={{ fontSize: 12, color: DIM, marginBottom: 16 }}>Connect with a coach to start receiving personalized workouts with AI camera tracking</div>
            <Btn onClick={() => setTab("coaches")}>Find a Coach →</Btn>
          </div>
        )}
        {user?.role === ROLES.CLIENT && tab === "progress" && (
          <div style={{ animation: "fadeIn 0.4s ease", textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>📊</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Progress</div>
            <div style={{ fontSize: 12, color: DIM }}>Complete workouts to track your progress over time</div>
          </div>
        )}
      </main>

      <style>{`@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}} *{box-sizing:border-box;margin:0;padding:0} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:2px} button:hover{filter:brightness(1.1)} button:active{transform:scale(0.97)} input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.2)} pre::-webkit-scrollbar{height:4px} select{-webkit-appearance:none}`}</style>
    </div>
  );
}
