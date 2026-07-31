// ═══════════════════════════════════════════════════════════════════════
// CLIENT SETTINGS — profile edit (with photo upload), theme picker, sign out.
//
// FIX: "Update Profile" previously always showed "✓ Saved!" even though
// PUT /auth/profile didn't exist on the backend at all — every save
// silently failed (empty catch block swallowed the 404). Both the
// missing route and this silent-failure UI are fixed here.
//
// Photo storage note: stored as a compressed base64 data URL directly in
// the database (same pattern as the existing food-photo feature) —
// there's no S3/R2 object storage configured yet, so this is a pragmatic
// shortcut, not the schema's original "S3/R2 URL" design intent. Fine for
// small profile thumbnails; worth revisiting if photo volume grows.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../../theme/theme.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { useTheme } from "../../context/ThemeContext.jsx";
import { api } from "../../lib/api.js";
import { compressImage } from "../../lib/utils.js";
import { Card, Btn, Input, ST } from "../../components/ui.jsx";

export default function ClientSettingsPage() {
  const { user, logout } = useAuth();
  const { themeName, switchTheme, themes } = useTheme();
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "" });
  const [avatar, setAvatar] = useState(null); // lives on ClientProfile, not the base user object — fetched below
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    api.get("/auth/me").then(r => { if (r.profile?.avatar) setAvatar(r.profile.avatar); }).catch(() => {});
  }, []);

  const save = async () => {
    setError("");
    try {
      await api.put("/auth/profile", { name: profile.name });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError("Could not save: " + e.message); }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingPhoto(true); setError("");
    try {
      const compressed = await compressImage(file, 300, 0.75);
      await api.put("/auth/profile", { avatar: compressed });
      setAvatar(compressed);
    } catch (e) { setError("Could not upload photo: " + e.message); }
    setUploadingPhoto(false);
  };

  return (
    <div>
      <ST>Settings</ST>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ position: "relative" }}>
            {avatar ? <img src={avatar} alt="" style={{ width: 56, height: 56, borderRadius: 16, objectFit: "cover" }} /> :
              <div style={{ width: 56, height: 56, borderRadius: 16, background: C.gr, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#000" }}>{(profile.name || "U")[0].toUpperCase()}</div>}
            <label style={{ position: "absolute", bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, background: C.ac, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 10, border: `2px solid ${C.sf}` }}>
              {uploadingPhoto ? "…" : "📷"}
              <input type="file" accept="image/*" onChange={uploadPhoto} disabled={uploadingPhoto} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ fontSize: 12, color: C.mt }}>Tap the camera icon to add or change your photo — it'll show up here instead of your initials.</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
          <Input label="Email" type="email" value={profile.email} disabled style={{ opacity: .6 }} />
          <div style={{ fontSize: 11, color: C.mt, marginTop: -6 }}>Email changes aren't supported yet — contact your coach or admin if this needs to change.</div>
          {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
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
