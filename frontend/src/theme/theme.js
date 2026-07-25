// ═══════════════════════════════════════════════════════════════════════
// THEME SYSTEM — C is a single, shared, MUTABLE object (not reassigned,
// only its keys are updated by applyTheme). Every file that imports C
// gets a live binding to the same object — mutating a key here is
// visible everywhere that imported it, which is what lets theme
// switching update the whole app without a full re-render tree.
//
// Do not ever do `C = {...}` anywhere — always mutate keys in place
// (`C.bg = "..."`), or every other file's reference to C goes stale.
// ═══════════════════════════════════════════════════════════════════════
import { ls } from "../lib/storage.js";

export const THEMES = {
  dark: { name: "Golden Hour", bg: "#0a0e16", sf: "#141a24", s2: "#1c2431", bd: "#252f3f", tx: "#f0f3f7", mt: "#8b96a8", ac: "#f5a623", a2: "#22d3a8", gr: "linear-gradient(135deg,#f5a623 0%,#ffc857 55%,#ff8c42 100%)", dg: "#ff5c5c", wn: "#ffb84d", ok: "#22d3a8", or: "#ff8c42", pk: "#ff6b9d" },
  light: { name: "Clean Light", bg: "#f0f2f5", sf: "#ffffff", s2: "#e4e6eb", bd: "#ced0d4", tx: "#1c1e21", mt: "#65676b", ac: "#5b5fc7", a2: "#0ea5e9", gr: "linear-gradient(135deg,#5b5fc7 0%,#8b5cf6 50%,#0ea5e9 100%)", dg: "#ef4444", wn: "#f59e0b", ok: "#22c55e", or: "#f97316", pk: "#ec4899" },
  sunset: { name: "Sunset Warm", bg: "#0a0908", sf: "#161310", s2: "#201c17", bd: "#2e2820", tx: "#f8e8d4", mt: "#a89080", ac: "#f97316", a2: "#eab308", gr: "linear-gradient(135deg,#f59e0b 0%,#eab308 55%,#fbbf24 100%)", dg: "#ef4444", wn: "#f59e0b", ok: "#22c55e", or: "#f97316", pk: "#ec4899" },
};

export const C = { ...THEMES[ls.get("theme", "dark") || "dark"] };

export function applyTheme(name) {
  const t = THEMES[name] || THEMES.dark;
  Object.keys(t).forEach((k) => { C[k] = t[k]; });
}
