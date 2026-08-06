// ═══════════════════════════════════════════════════════════════════════
// EMAIL — sends via Resend (already a listed dependency, never actually
// wired up until now). Requires RESEND_API_KEY as an env var; if it's
// missing, email sending fails loudly rather than pretending to succeed
// — registration is genuinely blocked without it working, since the
// whole point is requiring a real, verified email.
// ═══════════════════════════════════════════════════════════════════════
import { Resend } from "resend";
import { logger } from "../server.js";

let client = null;
function getClient() {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  client = new Resend(key);
  return client;
}

// FROM_EMAIL must be a verified sender/domain in your Resend account —
// Resend rejects sends from unverified domains. Falls back to their
// shared sandbox address for early testing, which only delivers to the
// account owner's own email.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "CoachMe <onboarding@resend.dev>";

export async function sendVerificationCodeEmail(toEmail, code) {
  const resend = getClient();
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: `${code} is your CoachMe verification code`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Verify your email</h2>
        <p>Enter this code to finish setting up your CoachMe account:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; background: #f5f5f5; padding: 16px 24px; border-radius: 8px; text-align: center; margin: 24px 0;">${code}</div>
        <p style="color: #666; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
  if (error) {
    logger.error("Failed to send verification email", { toEmail, error });
    throw new Error(`Email send failed: ${error.message || JSON.stringify(error)}`);
  }
}
