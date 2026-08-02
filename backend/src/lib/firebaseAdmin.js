// ═══════════════════════════════════════════════════════════════════════
// FIREBASE ADMIN — initialized once, lazily, from the
// FIREBASE_SERVICE_ACCOUNT_JSON environment variable (the full service
// account JSON file's contents, pasted as one env var value on Railway —
// never checked into the repo, never seen by anyone reading this code).
//
// If the env var is missing (e.g. a fresh dev environment that hasn't
// set it up yet), every function in this module fails gracefully rather
// than crashing the whole server on boot — push notifications are
// additive, not something the app should hard-depend on to even start.
// ═══════════════════════════════════════════════════════════════════════
import admin from "firebase-admin";
import { logger } from "../server.js";

let app = null;
let initAttempted = false;

function getApp() {
  if (initAttempted) return app;
  initAttempted = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    logger.warn("FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications are disabled");
    return null;
  }
  try {
    const credentials = JSON.parse(raw);
    app = admin.initializeApp({ credential: admin.credential.cert(credentials) });
    return app;
  } catch (err) {
    logger.error("Failed to initialize Firebase Admin", { error: err.message });
    return null;
  }
}

export function getMessaging() {
  const a = getApp();
  return a ? admin.messaging(a) : null;
}
