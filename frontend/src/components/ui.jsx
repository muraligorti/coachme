// ═══════════════════════════════════════════════════════════════════════
// SHARED UI PRIMITIVES — Card, Btn, Input, Modal, etc. Every page in the
// app is built out of these. If a page needs a one-off variant, prefer
// passing a `style` override to one of these over duplicating markup.
//
// ST specifically also renders the sign-out button (see the header
// comment inside it) — that's why this file depends on useAuth. Loading
// primitives (Spin/Splash) deliberately live in Loading.jsx, not here,
// to avoid a circular import with AuthContext.jsx (which needs Splash
// while resolving the session, before this file could safely import it).
// ═══════════════════════════════════════════════════════════════════════
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";
export { Spin } from "./Loading.jsx";

export const Card = ({ children, style, onClick, ...p }) => (
  <div onClick={onClick} className={onClick ? "jz-press" : undefined}
    style={{ background: `linear-gradient(165deg, ${C.sf} 0%, ${C.bg} 130%)`, border: `1px solid ${C.bd}`, borderRadius: 18, padding: 20, boxShadow: "0 6px 20px rgba(0,0,0,.22)", cursor: onClick ? "pointer" : undefined, ...style }} {...p}>
    {children}
  </div>
);

export const Badge = ({ children, color = C.ac, style }) => (
  <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: color + "22", color, ...style }}>{children}</span>
);

export const Btn = ({ children, variant = "primary", style, disabled, ...p }) => {
  const v = {
    primary: { background: C.gr, color: "#fff", boxShadow: `0 6px 18px ${C.ac}45` },
    secondary: { background: C.s2, color: C.tx, border: `1px solid ${C.bd}` },
    danger: { background: C.dg + "22", color: C.dg },
    ghost: { background: "transparent", color: C.mt },
  };
  return (
    <button className="jz-press" style={{ padding: "12px 24px", borderRadius: 12, border: "none", fontWeight: 700, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? .5 : 1, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", letterSpacing: ".1px", ...v[variant], ...style }} disabled={disabled} {...p}>
      {children}
    </button>
  );
};

export const Input = ({ label, style, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
    {label && <label style={{ fontSize: 13, color: C.mt, fontWeight: 500 }}>{label}</label>}
    <input style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "12px 16px", color: C.tx, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", ...style }} {...p} />
  </div>
);

export const TextArea = ({ label, style, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
    {label && <label style={{ fontSize: 13, color: C.mt, fontWeight: 500 }}>{label}</label>}
    <textarea style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "12px 16px", color: C.tx, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", minHeight: 80, resize: "vertical", ...style }} {...p} />
  </div>
);

export const Sel = ({ label, options, style, ...p }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
    {label && <label style={{ fontSize: 13, color: C.mt, fontWeight: 500 }}>{label}</label>}
    <select style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "12px 16px", color: C.tx, fontSize: 14, outline: "none", fontFamily: "inherit", ...style }} {...p}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

export const Modal = ({ open, onClose, title, children, wide }) => {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div style={{ background: C.sf, borderRadius: 20, padding: 24, maxWidth: wide ? 640 : 480, width: "100%", maxHeight: "85vh", overflowY: "auto", border: `1px solid ${C.bd}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ color: C.tx, margin: 0, fontSize: 18 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.mt, fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const Empty = ({ icon, text }) => (
  <div style={{ textAlign: "center", padding: 48, color: C.mt }}>
    <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 14 }}>{text}</div>
  </div>
);

// The per-page header — title + sign-out, always on their own row, plus
// an optional second row of page-specific action buttons. Sign-out lives
// here (not as a floating overlay) specifically so it can never collide
// with a page's own header buttons — see the git history / ADR notes for
// why this shape was chosen after a real bug with the earlier approach.
export const ST = ({ children, right }) => {
  const { logout } = useAuth();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 style={{ color: C.tx, fontSize: 20, margin: 0, fontWeight: 700 }}>{children}</h2>
        <button onClick={() => { if (window.confirm("Sign out of CoachMe.life?")) logout(); }} style={{ width: 32, height: 32, borderRadius: 16, border: `1px solid ${C.bd}`, cursor: "pointer", background: C.sf, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }} title="Sign Out">🚪</button>
      </div>
      {right && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>{right}</div>}
    </div>
  );
};

// Stat card — used all over Dashboard/Reports for a labeled number with
// an icon and a soft color-tinted glow behind it.
export const SC = ({ label, value, icon, color }) => (
  <Card style={{ padding: 16, position: "relative", overflow: "hidden" }}>
    <div style={{ position: "absolute", top: -20, right: -20, width: 70, height: 70, borderRadius: "50%", background: color, opacity: .16, filter: "blur(18px)" }} />
    <div style={{ width: 38, height: 38, borderRadius: 11, background: color + "20", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, fontSize: 18, boxShadow: `0 4px 14px ${color}40`, position: "relative" }}>{icon}</div>
    <div style={{ fontSize: 23, fontWeight: 800, color: C.tx, letterSpacing: "-.3px", position: "relative" }}>{value}</div>
    <div style={{ fontSize: 11.5, color: C.mt, marginTop: 2, fontWeight: 500, position: "relative" }}>{label}</div>
  </Card>
);

export const Tabs = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 4, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
    {tabs.map((t) => (
      <button key={t.id} onClick={() => onChange(t.id)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: active === t.id ? C.ac : C.s2, color: active === t.id ? "#fff" : C.mt, whiteSpace: "nowrap", transition: "all .2s" }}>{t.label}</button>
    ))}
  </div>
);

export const PBar = ({ value, max = 100, color = C.ac }) => (
  <div style={{ height: 6, borderRadius: 3, background: C.bd, overflow: "hidden" }}>
    <div style={{ height: "100%", width: `${Math.min((value / max) * 100, 100)}%`, borderRadius: 3, background: color, transition: "width .5s" }} />
  </div>
);

// Real profile photo when a client/coach has uploaded one; falls back to
// an initials-in-gradient circle otherwise. Used anywhere a person needs
// a visual identifier — client lists, batch rosters, etc.
export const Avatar = ({ src, name, size = 42, radius }) => {
  const r = radius ?? Math.round(size * 0.28);
  const initial = (name || "?")[0]?.toUpperCase() || "?";
  return src ? (
    <img src={src} alt="" style={{ width: size, height: size, borderRadius: r, objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: r, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.38), fontWeight: 700, color: "#fff", flexShrink: 0 }}>{initial}</div>
  );
};
