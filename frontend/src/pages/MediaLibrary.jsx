// ═══════════════════════════════════════════════════════════════════════
// MEDIA LIBRARY — client progress photos/measurement photos/check-in
// photos, and separately workout exercise/form/routine videos. Currently
// localStorage-only.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../theme/theme.js";
import { ls } from "../lib/storage.js";
import { Card, Btn, Input, TextArea, Sel, Modal, Empty, Tabs } from "../components/ui.jsx";

export default function MediaLibrary({ clientId, clientName }) {
  const clientKey = `media_client_${clientId || "all"}`;
  const workoutKey = `media_workout_${clientId || "all"}`;
  const [clientMedia, setClientMedia] = useState(ls.get(clientKey, []));
  const [workoutMedia, setWorkoutMedia] = useState(ls.get(workoutKey, []));
  const [showAdd, setShowAdd] = useState(false);
  const [section, setSection] = useState("client");
  const [tab, setTab] = useState("progress");
  const [form, setForm] = useState({ title: "", description: "", category: "progress", url: "" });

  const handleUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const entry = { id: Date.now(), title: form.title || file.name, description: form.description, category: form.category, type: file.type.startsWith("video") ? "video" : "photo", url: ev.target.result, fileName: file.name, fileSize: file.size, date: new Date().toISOString().slice(0, 10), shared: false, clientId };
      if (section === "client") { const u = [...clientMedia, entry]; setClientMedia(u); ls.set(clientKey, u); }
      else { const u = [...workoutMedia, entry]; setWorkoutMedia(u); ls.set(workoutKey, u); }
      setForm({ title: "", description: "", category: section === "client" ? "progress" : "exercise", url: "" }); setShowAdd(false);
    };
    reader.readAsDataURL(file);
  };

  const toggleShare = (id) => {
    if (section === "client") { const u = clientMedia.map(i => i.id === id ? { ...i, shared: !i.shared } : i); setClientMedia(u); ls.set(clientKey, u); }
    else { const u = workoutMedia.map(i => i.id === id ? { ...i, shared: !i.shared } : i); setWorkoutMedia(u); ls.set(workoutKey, u); }
  };

  const deleteItem = (id) => {
    if (section === "client") { const u = clientMedia.filter(i => i.id !== id); setClientMedia(u); ls.set(clientKey, u); }
    else { const u = workoutMedia.filter(i => i.id !== id); setWorkoutMedia(u); ls.set(workoutKey, u); }
  };

  const items = section === "client" ? clientMedia : workoutMedia;
  const progress = items.filter(i => i.category === "progress");
  const measurements = items.filter(i => i.category === "measurements");
  const checkins = items.filter(i => i.category === "checkin");
  const exercises = items.filter(i => i.category === "exercise");
  const formDemos = items.filter(i => i.category === "form");
  const routines = items.filter(i => i.category === "routine");

  const renderItem = (item) => {
    const isVideo = item.type === "video";
    return (
      <Card key={item.id} style={{ padding: isVideo ? 14 : 8, position: "relative" }}>
        {isVideo ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{item.title}</div>
                {item.description && <div style={{ fontSize: 12, color: C.mt, marginTop: 2 }}>{item.description}</div>}
                <div style={{ fontSize: 11, color: C.mt, marginTop: 4 }}>{item.date} · {(item.fileSize / 1024 / 1024).toFixed(1)}MB</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => toggleShare(item.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: item.shared ? C.ok + "20" : C.s2, color: item.shared ? C.ok : C.mt }}>{item.shared ? "Shared" : "Share"}</button>
                <button onClick={() => deleteItem(item.id)} style={{ padding: "4px 8px", borderRadius: 6, border: "none", fontSize: 11, cursor: "pointer", background: C.dg + "15", color: C.dg }}>✕</button>
              </div>
            </div>
            {item.url && item.url.startsWith("data:video") && <video src={item.url} controls style={{ width: "100%", borderRadius: 8, marginTop: 10, maxHeight: 200 }} />}
          </>
        ) : (
          <>
            <img src={item.url} style={{ width: "100%", borderRadius: 8, aspectRatio: "3/4", objectFit: "cover" }} />
            <div style={{ fontSize: 11, color: C.tx, marginTop: 4, fontWeight: 500, textAlign: "center" }}>{item.title || item.date}</div>
            <div style={{ fontSize: 10, color: C.mt, textAlign: "center" }}>{item.date}</div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <button onClick={() => toggleShare(item.id)} style={{ flex: 1, padding: "3px", borderRadius: 4, border: "none", fontSize: 10, cursor: "pointer", background: item.shared ? C.ok + "20" : C.s2, color: item.shared ? C.ok : C.mt }}>{item.shared ? "Shared" : "Share"}</button>
              <button onClick={() => deleteItem(item.id)} style={{ padding: "3px 6px", borderRadius: 4, border: "none", fontSize: 10, cursor: "pointer", background: C.dg + "15", color: C.dg }}>✕</button>
            </div>
          </>
        )}
      </Card>
    );
  };

  const clientTabs = [{ id: "progress", label: `Progress (${progress.length})` }, { id: "measurements", label: `Measurements (${measurements.length})` }, { id: "checkin", label: `Check-ins (${checkins.length})` }];
  const workoutTabs = [{ id: "exercise", label: `Exercises (${exercises.length})` }, { id: "form", label: `Form Demos (${formDemos.length})` }, { id: "routine", label: `Routines (${routines.length})` }];
  const activeTabs = section === "client" ? clientTabs : workoutTabs;
  const activeItems = items.filter(i => i.category === tab);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>{clientName ? "Media — " + clientName : "Media Library"}</span>
        <Btn onClick={() => { setForm({ title: "", description: "", category: section === "client" ? "progress" : "exercise", url: "" }); setShowAdd(true); }} style={{ padding: "6px 14px", fontSize: 12 }}>+ Upload</Btn>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button onClick={() => { setSection("client"); setTab("progress"); }} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: section === "client" ? `2px solid ${C.ac}` : `1px solid ${C.bd}`, background: section === "client" ? C.ac + "15" : C.sf, cursor: "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>👤</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: section === "client" ? C.ac : C.mt }}>Client Media</div>
          <div style={{ fontSize: 10, color: C.mt }}>Check-ins · Measurements · Progress</div>
        </button>
        <button onClick={() => { setSection("workout"); setTab("exercise"); }} style={{ flex: 1, padding: "10px 8px", borderRadius: 12, border: section === "workout" ? `2px solid ${C.ac}` : `1px solid ${C.bd}`, background: section === "workout" ? C.ac + "15" : C.sf, cursor: "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 18, marginBottom: 4 }}>💪</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: section === "workout" ? C.ac : C.mt }}>Workout Media</div>
          <div style={{ fontSize: 10, color: C.mt }}>Exercises · Form Demos · Routines</div>
        </button>
      </div>

      <Tabs tabs={activeTabs} active={tab} onChange={setTab} />

      {activeItems.length === 0 ? <Empty icon={section === "client" ? "📸" : "🎥"} text={`No ${tab} media yet. Tap + Upload to add.`} /> :
        activeItems[0]?.type === "video" ?
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{activeItems.map(renderItem)}</div> :
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{activeItems.map(renderItem)}</div>
      }

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={section === "client" ? "Upload Client Media" : "Upload Workout Media"} wide>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder={section === "client" ? "e.g. Front pose — Week 4" : "e.g. Squat Form Tutorial"} />
          <Sel label="Category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={section === "client" ? [{ value: "progress", label: "Progress Photo" }, { value: "measurements", label: "Body Measurements" }, { value: "checkin", label: "Check-in Photo" }] : [{ value: "exercise", label: "Exercise Demo" }, { value: "form", label: "Form Correction" }, { value: "routine", label: "Full Routine" }]} />
          <TextArea label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief description" />
          <div>
            <label style={{ fontSize: 13, color: C.mt, fontWeight: 500, marginBottom: 6, display: "block" }}>Select File</label>
            <input type="file" accept="video/*,image/*" onChange={handleUpload} style={{ fontSize: 13, color: C.tx }} />
            <div style={{ fontSize: 11, color: C.mt, marginTop: 4 }}>Videos (MP4, MOV) or Images (JPG, PNG)</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
