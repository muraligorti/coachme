// ═══════════════════════════════════════════════════════════════════════
// THEME CONTEXT — lets any component switch themes via useTheme(), and
// persists the choice. The actual color values live in theme.js; this
// file is purely the React plumbing around it.
// ═══════════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useCallback } from "react";
import { THEMES, applyTheme } from "../theme/theme.js";
import { ls } from "../lib/storage.js";

const ThemeCtx = createContext(null);
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(ls.get("theme", "dark") || "dark");
  const switchTheme = useCallback((name) => { applyTheme(name); ls.set("theme", name); setThemeName(name); }, []);
  return <ThemeCtx.Provider value={{ themeName, switchTheme, themes: THEMES }}>{children}</ThemeCtx.Provider>;
}
