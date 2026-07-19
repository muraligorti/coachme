// ═══════════════════════════════════════════════════════════════════════
// NUTRITION PHOTO SERVICE — sends a client's food photo to Claude's vision
// API and asks for a structured calorie/macro estimate. This is explicitly
// an ESTIMATE, not a lab measurement — the frontend always shows it as
// editable and lets the client correct it before saving, never auto-saves
// a photo analysis silently. That's a deliberate trust decision, not an
// oversight: food-photo calorie estimation is inherently approximate
// (portion size from a 2D photo is genuinely hard to judge), and presenting
// it with false precision would be worse than not having the feature.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Keep stored/transmitted photos small — this is a food-log thumbnail, not
// a print-quality image. Rejects anything the frontend didn't compress
// properly rather than silently accepting multi-MB payloads into Postgres.
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // ~1.5MB base64 (~1.1MB raw)

const ANALYSIS_PROMPT = `You are estimating nutrition information from a photo of a meal for a fitness coaching app. Look at the image and identify the food(s) present, then estimate the nutrition for the full portion shown.

Respond with ONLY a JSON object, no other text, no markdown fences, in exactly this shape:
{"foodName": "short description e.g. 'Grilled chicken, rice, and steamed broccoli'", "calories": <integer>, "protein": <grams, number>, "carbs": <grams, number>, "fat": <grams, number>, "fiber": <grams, number>, "confidence": "low"|"medium"|"high", "notes": "one short sentence flagging anything that affects accuracy, e.g. hidden sauces/oils, unclear portion size, or partially obscured items"}

Be realistic about confidence — photos make portion size and hidden ingredients (oil, sauce, dressing) genuinely hard to judge. Use "low" confidence rather than pretending precision you don't have.`;

function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || "");
  if (!match) throw new AppError(400, "Photo must be a JPEG, PNG, or WebP data URL");
  const [, mediaType, base64Data] = match;
  if (base64Data.length > MAX_IMAGE_BYTES) {
    throw new AppError(400, "Photo is too large — please use a smaller/more compressed image");
  }
  return { mediaType, base64Data };
}

export async function analyzeFoodPhoto(imageDataUrl) {
  if (!ANTHROPIC_KEY) throw new AppError(503, "AI service not configured");
  const { mediaType, base64Data } = parseImageDataUrl(imageDataUrl);

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
        { type: "text", text: ANALYSIS_PROMPT },
      ],
    }],
  };

  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error("Food photo analysis request failed", { error: err.message });
    throw new AppError(502, "Could not reach the AI service — please try again");
  }

  const data = await r.json();
  if (!r.ok) {
    logger.error("Food photo analysis API error", { status: r.status, data });
    throw new AppError(502, "AI analysis failed — please try again or enter values manually");
  }

  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
  let parsed;
  try {
    const jsonText = text.replace(/^```json\s*|\s*```$/g, "").trim();
    parsed = JSON.parse(jsonText);
  } catch {
    logger.error("Food photo analysis returned non-JSON", { text });
    throw new AppError(502, "Could not read the AI's analysis — please enter values manually");
  }

  return {
    foodName: String(parsed.foodName || "Meal").slice(0, 200),
    calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
    protein: Math.max(0, Number(parsed.protein) || 0),
    carbs: Math.max(0, Number(parsed.carbs) || 0),
    fat: Math.max(0, Number(parsed.fat) || 0),
    fiber: Math.max(0, Number(parsed.fiber) || 0),
    confidence: ["low", "medium", "high"].includes(parsed.confidence) ? parsed.confidence : "low",
    notes: String(parsed.notes || "").slice(0, 300),
  };
}
