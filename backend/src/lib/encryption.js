// ═══════════════════════════════════════════════════════════════════════
// Field-level encryption for sensitive data (client medical conditions,
// Razorpay API secrets, and anything similar). Real AES-256-GCM, keyed
// by the ENCRYPTION_KEY env var — a 32-byte key, given as a 64-character
// hex string (generate one with `openssl rand -hex 32`).
//
// Previously this was just Base64 encoding — an ENCODING, not
// encryption, trivially reversible by anyone with read access to the
// database. That was fine as a placeholder but not for what's stored
// here now. If ENCRYPTION_KEY is missing, this fails loudly rather than
// silently falling back to something insecure.
//
// Format written: "v2:<iv-hex>:<authTag-hex>:<ciphertext-hex>" — the
// "v2:" prefix lets decryptField distinguish new-format values from any
// old Base64-only values that may already exist in the database, so a
// key rotation doesn't need a hard cutover.
// ═══════════════════════════════════════════════════════════════════════
import crypto from "crypto";

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) throw new Error("ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes) — generate one with `openssl rand -hex 32`");
  return Buffer.from(hex, "hex");
}

export function encryptField(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12); // 96-bit IV, standard for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v2:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptField(encoded) {
  if (!encoded) return encoded;
  if (!encoded.startsWith("v2:")) {
    // Legacy Base64-only value from before real encryption existed —
    // decode it as-is so old data doesn't break, without pretending it
    // was ever actually encrypted.
    return Buffer.from(encoded, "base64").toString("utf8");
  }
  const [, ivHex, authTagHex, ciphertextHex] = encoded.split(":");
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
