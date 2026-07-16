// ═══════════════════════════════════════════════════════════════════════
// NOTIFICATION SERVICE — outbound email/SMS delivery. authService calls
// this without knowing or caring whether the underlying provider is
// Resend, Twilio, or something else entirely — that's an implementation
// detail that lives here and can change without touching auth logic.
// ═══════════════════════════════════════════════════════════════════════
import { logger } from "../server.js";

// Returns true if the email was actually sent, false otherwise (caller
// falls back to another channel or returns the code directly).
export async function sendPasswordResetEmail(email, code) {
  const emailApiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY;
  if (!emailApiKey) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(emailApiKey);
    await resend.emails.send({
      from: process.env.EMAIL_FROM || "CoachMe <noreply@coachme.life>",
      to: email,
      subject: "CoachMe — Password Reset Code",
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#6c5ce7;">CoachMe.life</h2>
        <p>Hi,</p>
        <p>You requested a password reset. Use this code within 30 minutes:</p>
        <div style="background:#f0f0f5;padding:20px;border-radius:12px;text-align:center;margin:20px 0;">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#333;">${code}</span>
        </div>
        <p>If you didn't request this, you can safely ignore this email.</p>
        <p style="color:#888;font-size:13px;">— CoachMe.life Team</p>
      </div>`,
    });
    logger.info("Password reset email sent", { email });
    return true;
  } catch (err) {
    logger.error("Email send failed", { error: err.message });
    return false;
  }
}

export async function sendPasswordResetSms(phone, code) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromPhone) return false;

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const cleanTo = phone.replace(/[\s\-\(\)]/g, "");
    const toPhone = cleanTo.startsWith("+") ? cleanTo : `+${cleanTo}`;
    await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
      body: new URLSearchParams({
        To: toPhone, From: fromPhone,
        Body: `CoachMe.life - Your password reset code is: ${code}\n\nValid for 30 minutes. Do not share this code.`,
      }).toString(),
    });
    logger.info("Password reset SMS sent", { phone: toPhone.slice(0, 6) + "***" });
    return true;
  } catch (err) {
    logger.error("SMS send failed", { error: err.message });
    return false;
  }
}
