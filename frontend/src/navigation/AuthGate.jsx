// ═══════════════════════════════════════════════════════════════════════
// AUTH GATE — the root routing decision: logged out -> AuthScreen,
// CLIENT -> ClientMainApp, ADMIN -> AdminMainApp, COACH -> MainApp.
//
// FIX: previously ADMIN fell through to the coach MainApp (the ternary
// only special-cased CLIENT) — an admin logging in saw the regular coach
// app with no admin tooling at all. Now explicit per-role.
// ═══════════════════════════════════════════════════════════════════════
import { useAuth } from "../context/AuthContext.jsx";
import AuthScreen from "../pages/AuthScreen.jsx";
import MainApp from "./MainApp.jsx";
import ClientMainApp from "./ClientMainApp.jsx";
import AdminMainApp from "./AdminMainApp.jsx";

export default function AuthGate() {
  const { user } = useAuth();
  if (!user) return <AuthScreen />;
  const role = (user.role || "").toUpperCase();
  if (role === "CLIENT") return <ClientMainApp />;
  if (role === "ADMIN") return <AdminMainApp />;
  return <MainApp />;
}
