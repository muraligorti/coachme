// ═══════════════════════════════════════════════════════════════════════
// Field-level encryption for sensitive data (e.g. client medical conditions).
// Placeholder implementation — replace with real AES-256-GCM using the
// ENCRYPTION_KEY env var before handling real medical data in production.
// ═══════════════════════════════════════════════════════════════════════
export function encryptField(plaintext) {
  return Buffer.from(plaintext).toString("base64");
}

export function decryptField(encoded) {
  return Buffer.from(encoded, "base64").toString("utf8");
}
