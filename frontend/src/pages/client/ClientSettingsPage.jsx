// ═══════════════════════════════════════════════════════════════════════
// CLIENT SETTINGS — profile edit, theme picker, sign out.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../../theme/theme.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { api } from "../../lib/api.js";
import { Card, Btn, Input, ST } from "../../components/ui.jsx";

export default function ClientSettingsPage() {
  const { user, logout } = useAuth();
  const { themeName, switchTheme, themes } = useTheme();
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [saved, setSaved] = useState(false);
  const save = async () => { try { await api.put("/auth/profile", profile); setSaved(true); setTimeout(() => setSaved(false), 2000); } catch { } };
  return (
    <div>
      <ST>Settings</ST>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
          <Input label="Email" type="email" value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} />
          <Btn onClick={save} style={{ width: "100%" }}>{saved ? "✓ Saved!" : "Save Profile"}</Btn>
        </div>
      </Card>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 12 }}>Theme</div>
        <div style={{ display: "flex", gap: 8 }}>
          {Object.entries(themes).map(([k, t]) => (
            <button key={k} onClick={() => switchTheme(k)} style={{ flex: 1, padding: "12px 8px", borderRadius: 12, border: themeName === k ? `2px solid ${C.ac}` : `2px solid ${C.bd}`, background: t.bg, cursor: "pointer" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.tx }}>{t.name}</div>
            </button>
          ))}
        </div>
      </Card>
      <Card><Btn variant="danger" onClick={logout} style={{ width: "100%" }}>Sign Out</Btn></Card>
    </div>
  );
}
