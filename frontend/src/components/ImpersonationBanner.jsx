// ═══════════════════════════════════════════════════════════════════════
// IMPERSONATION BANNER — always visible while an admin is acting as
// another user, regardless of which app shell (coach/client) is
// currently rendering. Deliberately impossible to miss or dismiss —
// this is a safety feature, not a preference.
// ═══════════════════════════════════════════════════════════════════════
import { C } from "../theme/theme.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function ImpersonationBanner() {
  const { user, impersonating, stopImpersonating } = useAuth();
  if (!impersonating) return null;

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 9999, background: C.wn, color: "#1a1a1a", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600 }}>
      <span>🎭 Viewing as {user?.name || user?.email} ({user?.role})</span>
      <button onClick={stopImpersonating} style={{ background: "#1a1a1a", color: C.wn, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Stop Impersonating</button>
    </div>
  );
}
