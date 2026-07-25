// ═══════════════════════════════════════════════════════════════════════
// APP — the root component. This file used to contain the entire
// application (~3400 lines, 35+ components) in one file. It's now split
// by domain across lib/, theme/, context/, components/, navigation/, and
// pages/ — see those folders for the actual implementation. This file's
// only job is composing the three top-level providers and rendering the
// routing gate.
// ═══════════════════════════════════════════════════════════════════════
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import AuthGate from "./navigation/AuthGate.jsx";

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}
