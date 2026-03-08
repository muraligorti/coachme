import { Router } from "express";
import { logger } from "../server.js";
import { authenticate, aiLimiter, sanitizeBody } from "../middleware/auth.js";
const router = Router();

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// POST /api/ai/chat — Proxy AI calls (hides API key)
router.post("/chat", authenticate, aiLimiter, sanitizeBody, async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: "AI service not configured" });
    const { system, message, search } = req.body;
    const body = { model: "claude-sonnet-4-20250514", max_tokens: 1000, system: system || "", messages: [{ role: "user", content: message }] };
    if (search) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    res.json({ text, usage: data.usage });
  } catch (err) {
    logger.error("AI proxy error", { error: err.message });
    res.status(500).json({ error: "AI request failed" });
  }
});

// POST /api/ai/match — AI coach matching
router.post("/match", authenticate, aiLimiter, sanitizeBody, async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: "AI not configured" });
    const { userProfile, coaches } = req.body;
    const sys = "You are a coach matching AI. Return JSON: {\"matches\":[{\"coachId\":\"...\",\"score\":95,\"reason\":\"...\"}]}";
    const msg = `User: ${JSON.stringify(userProfile)}\nCoaches: ${JSON.stringify(coaches)}\nReturn top 5 matches.`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: sys, messages: [{ role: "user", content: msg }] }),
    });
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    try { res.json(JSON.parse(text.replace(/```json|```/g, "").trim())); }
    catch { res.json({ matches: [], raw: text }); }
  } catch (err) { res.status(500).json({ error: "Match failed" }); }
});

// POST /api/ai/leads — AI lead scoring
router.post("/leads", authenticate, aiLimiter, sanitizeBody, async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: "AI not configured" });
    const { coachProfile, searchData } = req.body;
    const sys = "Score fitness leads 0-100. Return JSON array: [{\"name\":\"...\",\"score\":85,\"reason\":\"...\",\"intent\":\"...\"}]";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: sys,
        messages: [{ role: "user", content: `Coach: ${JSON.stringify(coachProfile)}\nSearch data: ${JSON.stringify(searchData)}` }],
        tools: [{ type: "web_search_20250305", name: "web_search" }] }),
    });
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
    try { res.json(JSON.parse(text.replace(/```json|```/g, "").trim())); }
    catch { res.json([]); }
  } catch (err) { res.status(500).json({ error: "Lead scoring failed" }); }
});

export default router;
