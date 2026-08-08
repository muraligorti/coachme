// ═══════════════════════════════════════════════════════════════════════
// PUBLIC CONFIG — read-only, unauthenticated access to the small subset
// of admin-configurable values that are needed before a session exists
// (specializations shows up on the signup form itself). Deliberately
// does NOT expose tierFeatures or anything else from systemConfig here -
// only what's genuinely safe and necessary to be public.
// ═══════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { getConfig } from "../lib/systemConfig.js";

const router = Router();

router.get("/specializations", async (req, res) => {
  try { res.json({ specializations: await getConfig("specializations") }); }
  catch (err) { res.status(500).json({ error: "Failed to load specializations" }); }
});

export default router;
