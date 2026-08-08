// ═══════════════════════════════════════════════════════════════════════
// USERNAME — optional at signup, but everyone should be able to set or
// change it later too. Shared between coach and client Settings, since
// the backend endpoint (PUT /auth/username) already works for either
// role identically.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, Btn, Input } from "./ui.jsx";

export default function UsernameCard() {
  const [current, setCurrent] = useState(null); // null while loading
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.get("/auth/me").then(r => setCurrent(r?.user?.username || "")).catch(() => setCurrent("")); }, []);

  const save = async () => {
    const cleaned = value.trim().toLowerCase();
    if (cleaned.length < 3) { setError("Username must be at least 3 characters"); return; }
    if (!/^[a-z0-9_]+$/.test(cleaned)) { setError("Only letters, numbers, and underscores"); return; }
    setSaving(true); setError("");
    try {
      await api.put("/auth/username", { username: cleaned });
      setCurrent(cleaned); setEditing(false);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (current === null) return null;

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>👤 Username</div>
      <div style={{ fontSize: 11, color: C.mt, marginBottom: 12 }}>Optional — lets you log in with a username instead of your email.</div>

      {!editing ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, color: current ? C.tx : C.mt, fontFamily: current ? "monospace" : "inherit" }}>{current || "Not set"}</div>
          <button onClick={() => { setValue(current || ""); setEditing(true); setError(""); }} style={{ fontSize: 12, color: C.ac, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>{current ? "Change" : "Set username"}</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Input value={value} onChange={e => setValue(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())} placeholder="your_username" />
          {error && <div style={{ color: C.dg, fontSize: 13, padding: "10px 14px", background: C.dg + "15", borderRadius: 10 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={save} disabled={saving} style={{ flex: 1 }}>{saving ? "Saving…" : "Save"}</Btn>
            <Btn variant="secondary" onClick={() => { setEditing(false); setError(""); }} style={{ flex: 1 }}>Cancel</Btn>
          </div>
        </div>
      )}
      {saved && <div style={{ fontSize: 12, color: C.ok, marginTop: 8 }}>✓ Username updated</div>}
    </Card>
  );
}
