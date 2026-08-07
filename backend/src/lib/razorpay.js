// ═══════════════════════════════════════════════════════════════════════
// RAZORPAY — every call uses ONE COACH'S OWN key_id/key_secret (Basic
// Auth), never a platform-wide credential. Money flows directly from
// client to coach through the coach's own Razorpay account; this
// platform never touches it and never needs to be a licensed payment
// aggregator as a result. Deliberately just fetch() against the real
// REST API rather than adding the official Node SDK as a dependency —
// Payment Links is a small enough surface that a dependency isn't
// worth it for what's used here.
// ═══════════════════════════════════════════════════════════════════════
const BASE_URL = "https://api.razorpay.com/v1";

async function razorpayRequest(keyId, keySecret, method, path, body) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || data?.error?.reason || `Razorpay request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// amount must already be in the smallest currency unit (paise for INR) —
// callers are responsible for converting, this function just passes it
// through, matching Razorpay's own convention exactly.
export async function createPaymentLink(keyId, keySecret, { amount, currency, description, referenceId, customerName, customerContact, customerEmail }) {
  const body = {
    amount, currency: currency || "INR", description, reference_id: referenceId,
    notify: { sms: false, email: false }, // the coach shares the link manually via WhatsApp - no need for Razorpay's own notifications too
  };
  if (customerName || customerContact || customerEmail) {
    body.customer = { name: customerName || undefined, contact: customerContact || undefined, email: customerEmail || undefined };
  }
  return razorpayRequest(keyId, keySecret, "POST", "/payment_links", body);
}

export async function fetchPaymentLink(keyId, keySecret, paymentLinkId) {
  return razorpayRequest(keyId, keySecret, "GET", `/payment_links/${paymentLinkId}`);
}
