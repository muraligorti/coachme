import * as pushService from "../services/pushService.js";
import { logger } from "../server.js";

export async function registerToken(req, res) {
  try {
    const result = await pushService.registerToken(req.user.id, req.body?.token, req.body?.platform);
    res.json(result);
  } catch (err) {
    logger.error("Push token registration failed", { error: err.message });
    res.status(500).json({ error: "Failed to register for push notifications" });
  }
}
