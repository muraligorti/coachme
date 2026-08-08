// ═══════════════════════════════════════════════════════════════════════
// AI MEAL PLANNER — generates a daily meal plan via /api/ai/chat.
// NOTE: currently not persisted — see CoachMe Bible Vol 2, Module 6 for
// the plan to save generated plans as real records.
// ═══════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { C } from "../theme/theme.js";
import { api } from "../lib/api.js";
import { Card, Btn, Input, Sel, ST } from "../components/ui.jsx";

export default function MealPlannerPage() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ goal: "muscle_gain", calories: "2200", restrictions: "", preferences: "" });

  const gen = async () => {
    setLoading(true);
    try {
      const sysPrompt = `You are a nutrition planning assistant generating a real, usable daily meal plan for a fitness client.

Give a genuinely expert-level plan: specific, real dishes and portion sizes (not vague placeholders like "protein source"), accurate macro/calorie math that actually adds up to the target, and food combinations a real dietitian would suggest — draw fully on your nutrition knowledge, and search the web if it would help with current guidelines or regional cuisine specifics for the requested preferences.

The one thing to stay strict about: the stated restrictions are non-negotiable — never include an ingredient that violates them, and never invent dietary needs the person didn't mention. If their calorie target and stated preferences are in tension (e.g. very low calories with a preference that's hard to hit at that level), say so briefly rather than silently producing a plan that doesn't actually work.`;
      const r = await api.post("/ai/chat", {
        system: sysPrompt,
        message: `Generate a detailed daily meal plan: Goal: ${form.goal.replace("_", " ")}, Calories: ${form.calories}kcal, Restrictions: ${form.restrictions || "none"}, Preferences: ${form.preferences || "none"}. Include breakfast, lunch, dinner, 2 snacks with calories, protein, carbs, fat for each, and a running daily total.`,
        search: true,
      });
      setPlan(r.text || "Could not generate");
    } catch (e) { setPlan("Error: " + e.message); }
    setLoading(false);
  };

  return (
    <div>
      <ST>AI Meal Planner</ST>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Sel label="Goal" value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} options={[{ value: "muscle_gain", label: "Muscle Gain" }, { value: "fat_loss", label: "Fat Loss" }, { value: "maintenance", label: "Maintenance" }, { value: "performance", label: "Athletic Performance" }]} />
          <Input label="Target Calories" type="number" value={form.calories} onChange={e => setForm({ ...form, calories: e.target.value })} />
          <Input label="Restrictions" value={form.restrictions} onChange={e => setForm({ ...form, restrictions: e.target.value })} placeholder="e.g. vegetarian, no dairy" />
          <Input label="Preferences" value={form.preferences} onChange={e => setForm({ ...form, preferences: e.target.value })} placeholder="e.g. Indian cuisine" />
          <Btn onClick={gen} disabled={loading} style={{ width: "100%" }}>{loading ? "Generating…" : "🤖 Generate Meal Plan"}</Btn>
        </div>
      </Card>
      {plan && <Card><div style={{ fontSize: 15, fontWeight: 600, color: C.tx, marginBottom: 12 }}>Your Meal Plan</div><div style={{ fontSize: 13, color: C.tx, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{plan}</div></Card>}
    </div>
  );
}
