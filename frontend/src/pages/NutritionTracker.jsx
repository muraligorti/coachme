// ═══════════════════════════════════════════════════════════════════════
// NUTRITION TRACKER — manual food logging plus AI photo-based logging
// (POST /api/nutrition/analyze-photo -> Claude vision estimates calories/
// protein/carbs/fat/fiber, always shown as an editable review before
// saving, never auto-saved). Coach-visible automatically once saved.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { ls } from "../lib/storage.js";
import { compressImage, nowLocal } from "../lib/utils.js";
import { Card, Btn, Input, Sel, Modal, PBar, Spin } from "../components/ui.jsx";

export default function NutritionTracker({ cid }) {
  const key = `nut_${cid || "me"}`;
  const [meals, setMeals] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [deviceCal, setDeviceCal] = useState(0);
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", meal: "breakfast" });
  const today = new Date().toISOString().slice(0, 10);

  const [showPhoto, setShowPhoto] = useState(false);
  const [photoStep, setPhotoStep] = useState("capture"); // capture -> analyzing -> review
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoErr, setPhotoErr] = useState("");
  const [photoForm, setPhotoForm] = useState({ foodName: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", meal: "breakfast", loggedAt: nowLocal(), confidence: "", notes: "" });

  useEffect(() => {
    api.get(`/nutrition?date=${today}${cid ? `&clientId=${cid}` : ""}`).then(d => {
      const logs = Array.isArray(d) ? d : d.data || [];
      setMeals(logs); ls.set(key, logs);
    }).catch(() => setMeals(ls.get(key, [])));
    api.get("/health-data/mine").then(d => {
      const data = Array.isArray(d) ? d : d.data || [];
      const todayData = data.find(x => x.date === today);
      if (todayData?.caloriesBurned) setDeviceCal(todayData.caloriesBurned);
    }).catch(() => {
      const deviceData = ls.get("device_data", []);
      const todayDev = deviceData.find(x => x.date === today);
      if (todayDev?.caloriesBurned) setDeviceCal(todayDev.caloriesBurned);
    });
  }, [cid]);

  const tm = meals.filter(m => (m.date || "").startsWith(today));
  const tot = tm.reduce((a, m) => ({ cal: a.cal + (m.calories || 0), pro: a.pro + (m.protein || 0), carb: a.carb + (m.carbs || 0), fat: a.fat + (m.fat || 0) }), { cal: 0, pro: 0, carb: 0, fat: 0 });
  const tgt = { cal: 2200, pro: 150, carb: 250, fat: 70 };

  const save = async () => {
    const entry = { name: form.name, date: today, meal: form.meal, calories: +form.calories || 0, protein: +form.protein || 0, carbs: +form.carbs || 0, fat: +form.fat || 0, fiber: +form.fiber || 0, source: "manual" };
    if (cid) entry.clientId = cid;
    try {
      const saved = await api.post("/nutrition", entry);
      setMeals(prev => [...prev, saved]);
      const cached = ls.get(key, []); cached.push(saved); ls.set(key, cached);
    } catch {
      const local = { ...entry, id: Date.now() };
      setMeals(prev => [...prev, local]);
      const cached = ls.get(key, []); cached.push(local); ls.set(key, cached);
    }
    setShowAdd(false); setForm({ name: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", meal: "breakfast" });
  };

  const openPhotoLog = () => { setPhotoStep("capture"); setPhotoUrl(null); setPhotoErr(""); setPhotoForm({ foodName: "", calories: "", protein: "", carbs: "", fat: "", fiber: "", meal: "breakfast", loggedAt: nowLocal(), confidence: "", notes: "" }); setShowPhoto(true); };

  const onPhotoSelected = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setPhotoErr(""); setPhotoStep("analyzing");
    try {
      const compressed = await compressImage(file);
      setPhotoUrl(compressed);
      const est = await api.post("/nutrition/analyze-photo", { imageBase64: compressed });
      setPhotoForm(f => ({ ...f, foodName: est.foodName, calories: est.calories, protein: est.protein, carbs: est.carbs, fat: est.fat, fiber: est.fiber, confidence: est.confidence, notes: est.notes }));
      setPhotoStep("review");
    } catch (err) {
      setPhotoErr(err.message || "Couldn't analyze that photo — you can still enter values manually below.");
      setPhotoStep("review");
    }
  };

  const savePhotoLog = async () => {
    const entry = {
      name: photoForm.foodName || "Meal", meal: photoForm.meal,
      calories: +photoForm.calories || 0, protein: +photoForm.protein || 0, carbs: +photoForm.carbs || 0, fat: +photoForm.fat || 0, fiber: +photoForm.fiber || 0,
      loggedAt: new Date(photoForm.loggedAt).toISOString(), date: photoForm.loggedAt.slice(0, 10),
      photoUrl, aiEstimated: !!photoForm.confidence, source: "ai_photo",
    };
    if (cid) entry.clientId = cid;
    try {
      const saved = await api.post("/nutrition", entry);
      setMeals(prev => [...prev, saved]);
      const cached = ls.get(key, []); cached.push(saved); ls.set(key, cached);
    } catch (err) { alert("Failed to save: " + err.message); return; }
    setShowPhoto(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>Today's Nutrition</span>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn variant="secondary" onClick={openPhotoLog} style={{ padding: "6px 12px", fontSize: 12 }}>📷 Photo</Btn>
          <Btn onClick={() => setShowAdd(true)} style={{ padding: "6px 14px", fontSize: 12 }}>+ Log</Btn>
        </div>
      </div>
      <Card style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
          {[{ l: "Calories", v: tot.cal, t: tgt.cal, c: C.ac, u: "kcal" }, { l: "Protein", v: tot.pro, t: tgt.pro, c: C.ok, u: "g" }, { l: "Carbs", v: tot.carb, t: tgt.carb, c: C.wn, u: "g" }, { l: "Fat", v: tot.fat, t: tgt.fat, c: C.pk, u: "g" }].map(m => (
            <div key={m.l}><div style={{ fontSize: 18, fontWeight: 700, color: m.c }}>{m.v}</div><PBar value={m.v} max={m.t} color={m.c} /><div style={{ fontSize: 10, color: C.mt, marginTop: 4 }}>{m.l}<br />{m.v}/{m.t}{m.u}</div></div>
          ))}
        </div>
      </Card>
      {deviceCal > 0 && (
        <Card style={{ padding: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.s2 }}>
          <div><div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>Activity (from device)</div><div style={{ fontSize: 11, color: C.mt }}>Calories burned today</div></div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.or }}>{deviceCal} kcal</div>
        </Card>
      )}
      {tm.length === 0 ? <div style={{ color: C.mt, fontSize: 13, textAlign: "center", padding: 20 }}>No meals logged</div> : tm.map(m => (
        <Card key={m.id} style={{ padding: 12, marginBottom: 6, display: "flex", gap: 10, alignItems: "center" }}>
          {m.photoUrl && <img src={m.photoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, display: "flex", alignItems: "center", gap: 6 }}>{m.name}{m.aiEstimated && <span style={{ fontSize: 9, fontWeight: 700, background: C.ac + "20", color: C.ac, padding: "2px 6px", borderRadius: 20 }}>AI</span>}</div>
            <div style={{ fontSize: 11, color: C.mt }}>{m.meal} · {m.calories}kcal{m.loggedAt ? ` · ${new Date(m.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
          </div>
          <div style={{ fontSize: 11, color: C.mt, textAlign: "right", flexShrink: 0 }}>P:{m.protein || 0}g C:{m.carbs || 0}g<br />F:{m.fat || 0}g Fb:{m.fiber || 0}g</div>
        </Card>
      ))}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log Food">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Food" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Grilled Chicken" />
          <Sel label="Meal" value={form.meal} onChange={e => setForm({ ...form, meal: e.target.value })} options={[{ value: "breakfast", label: "Breakfast" }, { value: "lunch", label: "Lunch" }, { value: "dinner", label: "Dinner" }, { value: "snack", label: "Snack" }]} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Calories" type="number" value={form.calories} onChange={e => setForm({ ...form, calories: e.target.value })} />
            <Input label="Protein (g)" type="number" value={form.protein} onChange={e => setForm({ ...form, protein: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Carbs (g)" type="number" value={form.carbs} onChange={e => setForm({ ...form, carbs: e.target.value })} />
            <Input label="Fat (g)" type="number" value={form.fat} onChange={e => setForm({ ...form, fat: e.target.value })} />
          </div>
          <Input label="Fiber (g)" type="number" value={form.fiber} onChange={e => setForm({ ...form, fiber: e.target.value })} />
          <Btn onClick={save} style={{ width: "100%" }}>Log Food</Btn>
        </div>
      </Modal>

      <Modal open={showPhoto} onClose={() => setShowPhoto(false)} title="Log Food with Photo" wide>
        {photoStep === "capture" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", padding: "10px 0" }}>
            <div style={{ fontSize: 13, color: C.mt, textAlign: "center" }}>Take or choose a photo of your meal — AI will estimate calories and macros, and you can adjust before saving.</div>
            <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "32px 20px", border: `2px dashed ${C.bd}`, borderRadius: 16, cursor: "pointer", width: "100%", boxSizing: "border-box" }}>
              <span style={{ fontSize: 32 }}>📷</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>Tap to take or choose a photo</span>
              <input type="file" accept="image/*" capture="environment" onChange={onPhotoSelected} style={{ display: "none" }} />
            </label>
          </div>
        )}
        {photoStep === "analyzing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "30px 0" }}>
            {photoUrl && <img src={photoUrl} alt="" style={{ width: 120, height: 120, borderRadius: 16, objectFit: "cover" }} />}
            <Spin />
            <div style={{ fontSize: 13, color: C.mt }}>Analyzing your meal…</div>
          </div>
        )}
        {photoStep === "review" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {photoUrl && <img src={photoUrl} alt="" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                {photoErr && <div style={{ fontSize: 12, color: C.wn, marginBottom: 6 }}>⚠️ {photoErr}</div>}
                {photoForm.confidence && <div style={{ fontSize: 11, color: C.mt, marginBottom: 4 }}>AI confidence: <b style={{ color: photoForm.confidence === "high" ? C.ok : photoForm.confidence === "medium" ? C.wn : C.dg }}>{photoForm.confidence}</b>{photoForm.notes ? ` — ${photoForm.notes}` : ""}</div>}
                <div style={{ fontSize: 11, color: C.mt }}>Review and adjust anything below before saving — AI estimates from a photo are a starting point, not exact.</div>
              </div>
            </div>
            <Input label="Food" value={photoForm.foodName} onChange={e => setPhotoForm({ ...photoForm, foodName: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Sel label="Meal" value={photoForm.meal} onChange={e => setPhotoForm({ ...photoForm, meal: e.target.value })} options={[{ value: "breakfast", label: "Breakfast" }, { value: "lunch", label: "Lunch" }, { value: "dinner", label: "Dinner" }, { value: "snack", label: "Snack" }]} />
              <Input label="Date & time" type="datetime-local" value={photoForm.loggedAt} onChange={e => setPhotoForm({ ...photoForm, loggedAt: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Calories" type="number" value={photoForm.calories} onChange={e => setPhotoForm({ ...photoForm, calories: e.target.value })} />
              <Input label="Protein (g)" type="number" value={photoForm.protein} onChange={e => setPhotoForm({ ...photoForm, protein: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Carbs (g)" type="number" value={photoForm.carbs} onChange={e => setPhotoForm({ ...photoForm, carbs: e.target.value })} />
              <Input label="Fat (g)" type="number" value={photoForm.fat} onChange={e => setPhotoForm({ ...photoForm, fat: e.target.value })} />
            </div>
            <Input label="Fiber (g)" type="number" value={photoForm.fiber} onChange={e => setPhotoForm({ ...photoForm, fiber: e.target.value })} />
            <Btn onClick={savePhotoLog} style={{ width: "100%" }}>Save Log</Btn>
          </div>
        )}
      </Modal>
    </div>
  );
}
