// ═══════════════════════════════════════════════════════════════════════
// CLIENT MEDIA — a client's own progress photos. localStorage-only.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../../theme/theme.js";
import { ls } from "../../lib/storage.js";
import { Btn, Modal, Empty, ST } from "../../components/ui.jsx";

export default function ClientMediaPage() {
  const [photos, setPhotos] = useState(ls.get("client_progress_photos", []));
  const [showAdd, setShowAdd] = useState(false);
  const handleUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const entry = { id: Date.now(), url: ev.target.result, date: new Date().toISOString().slice(0, 10), type: file.type.startsWith("video") ? "video" : "photo", fileName: file.name };
      const updated = [...photos, entry]; setPhotos(updated); ls.set("client_progress_photos", updated); setShowAdd(false);
    }; reader.readAsDataURL(file);
  };
  const deletePhoto = (id) => { const updated = photos.filter(p => p.id !== id); setPhotos(updated); ls.set("client_progress_photos", updated); };
  return (
    <div>
      <ST right={<Btn onClick={() => setShowAdd(true)} style={{ padding: "8px 14px", fontSize: 12 }}>+ Add Photo</Btn>}>Progress Photos</ST>
      {photos.length === 0 ? <Empty icon="📸" text="No progress photos yet. Tap + to add your first one." /> : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {photos.sort((a, b) => b.date.localeCompare(a.date)).map(p => (
            <div key={p.id} style={{ position: "relative", borderRadius: 12, overflow: "hidden", aspectRatio: "1" }}>
              <img src={p.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "4px 6px", background: "rgba(0,0,0,.6)", fontSize: 10, color: "#fff" }}>{p.date}</div>
              <button onClick={() => deletePhoto(p.id)} style={{ position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
          ))}
        </div>
      )}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Progress Photo">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
          <div style={{ fontSize: 13, color: C.mt, textAlign: "center" }}>Upload a progress photo or body check-in image</div>
          <label style={{ width: "100%", padding: 24, borderRadius: 12, border: `2px dashed ${C.bd}`, textAlign: "center", cursor: "pointer", color: C.mt, fontSize: 14 }}>
            📷 Tap to select photo
            <input type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
          </label>
        </div>
      </Modal>
    </div>
  );
}
