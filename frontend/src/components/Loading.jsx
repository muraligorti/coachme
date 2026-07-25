// ═══════════════════════════════════════════════════════════════════════
// LOADING STATES — deliberately a separate, leaf-level file (depends only
// on theme.js, nothing else) rather than living in components/ui.jsx.
// AuthContext.jsx needs Splash while it's resolving the current session,
// and components/ui.jsx needs useAuth (for the sign-out button in ST) —
// if Splash lived in ui.jsx, AuthContext.jsx <-> ui.jsx would import each
// other in a circle. Keeping Spin/Splash here, with no auth dependency,
// avoids that entirely.
// ═══════════════════════════════════════════════════════════════════════
import { C } from "../theme/theme.js";

export const Spin = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
    <div style={{ width: 32, height: 32, border: `3px solid ${C.bd}`, borderTopColor: C.ac, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
  </div>
);

export const Splash = () => (
  <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, flexDirection: "column", gap: 16 }}>
    <div style={{ width: 56, height: 56, borderRadius: 16, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff" }}>C</div>
    <Spin />
  </div>
);
