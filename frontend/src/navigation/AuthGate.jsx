// ═══════════════════════════════════════════════════════════════════════
// AUTH GATE — the root routing decision: logged out -> AuthScreen,
// logged in as CLIENT -> ClientMainApp, logged in as anything else
// (COACH/ADMIN) -> MainApp.
// ═══════════════════════════════════════════════════════════════════════
import { useAuth } from "../context/AuthContext.jsx";
import AuthScreen from "../pages/AuthScreen.jsx";
import MainApp from "./MainApp.jsx";
import ClientMainApp from "./ClientMainApp.jsx";

export default function AuthGate() {
  const { user } = useAuth();
  if (!user) return <AuthScreen />;
  const role = (user.role || "").toUpperCase();
  return role === "CLIENT" ? <ClientMainApp /> : <MainApp />;
}
