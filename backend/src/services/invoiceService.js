// ═══════════════════════════════════════════════════════════════════════
// INVOICE SERVICE — real, backend-persisted invoices (not the old
// localStorage-only version), with optional Razorpay Payment Link
// generation using each coach's OWN Razorpay credentials. Money flows
// directly from client to coach through the coach's own account; this
// platform never touches it.
//
// Amounts: stored in the database in paise (smallest INR unit),
// matching Razorpay's own convention exactly. The API boundary accepts
// and returns rupees (what a person actually types/reads) — conversion
// happens right here, not scattered across callers.
// ═══════════════════════════════════════════════════════════════════════
import { AppError } from "../lib/AppError.js";
import { encryptField, decryptField } from "../lib/encryption.js";
import { createPaymentLink, fetchPaymentLink } from "../lib/razorpay.js";
import * as invoiceRepository from "../repositories/invoiceRepository.js";
import * as profileRepository from "../repositories/profileRepository.js";
import { verifyCoachHasClient } from "./checkInService.js";

const rupeesToPaise = (rupees) => Math.round(Number(rupees) * 100);
const paiseToRupees = (paise) => Math.round(paise) / 100;

async function getCoachProfileOrThrow(userId) {
  const profile = await profileRepository.findCoachProfileByUserId(userId);
  if (!profile) throw new AppError(403, "Only coaches can manage invoices");
  return profile;
}

function serializeInvoice(inv) {
  return {
    id: inv.id, clientId: inv.clientId, clientName: inv.client?.displayName,
    amount: paiseToRupees(inv.amount), currency: inv.currency, description: inv.description,
    dueDate: inv.dueDate, status: inv.status,
    razorpayShortUrl: inv.razorpayShortUrl, razorpayStatus: inv.razorpayStatus,
    paidAt: inv.paidAt, createdAt: inv.createdAt,
  };
}

// ── Razorpay credentials (per-coach, never platform-wide) ─────────────

export async function getMyRazorpayStatus(userId) {
  const coach = await getCoachProfileOrThrow(userId);
  return { razorpayKeyId: coach.razorpayKeyId || null, connected: !!(coach.razorpayKeyId && coach.razorpayKeySecretEnc) };
}

export async function saveRazorpayKeys(userId, keyId, keySecret) {
  if (!keyId || !keySecret) throw new AppError(400, "Both Key ID and Key Secret are required");
  const coach = await getCoachProfileOrThrow(userId);
  await profileRepository.updateCoachProfile(userId, {
    razorpayKeyId: keyId.trim(),
    razorpayKeySecretEnc: encryptField(keySecret.trim()),
  });
  return { connected: true };
}

export async function disconnectRazorpay(userId) {
  await getCoachProfileOrThrow(userId);
  await profileRepository.updateCoachProfile(userId, { razorpayKeyId: null, razorpayKeySecretEnc: null });
  return { connected: false };
}

// ── Invoices ────────────────────────────────────────────────────────

export async function createInvoice(userId, { clientId, amount, description, dueDate }) {
  const coach = await getCoachProfileOrThrow(userId);
  if (!clientId) throw new AppError(400, "clientId is required");
  if (!amount || amount <= 0) throw new AppError(400, "amount must be greater than 0");
  await verifyCoachHasClient(userId, clientId);

  const invoice = await invoiceRepository.create({
    coachId: coach.id, clientId, amount: rupeesToPaise(amount),
    description: description || null, dueDate: dueDate ? new Date(dueDate) : null,
  });
  return serializeInvoice(await invoiceRepository.findById(invoice.id));
}

export async function listInvoices(userId) {
  const coach = await getCoachProfileOrThrow(userId);
  const rows = await invoiceRepository.findForCoach(coach.id);
  return rows.map(serializeInvoice);
}

async function loadOwnInvoiceOrThrow(userId, invoiceId) {
  const coach = await getCoachProfileOrThrow(userId);
  const invoice = await invoiceRepository.findById(invoiceId);
  if (!invoice || invoice.coachId !== coach.id) throw new AppError(404, "Invoice not found");
  return { coach, invoice };
}

export async function generatePaymentLink(userId, invoiceId) {
  const { coach, invoice } = await loadOwnInvoiceOrThrow(userId, invoiceId);
  if (invoice.status !== "PENDING") throw new AppError(400, "Only pending invoices can get a new payment link");
  if (!coach.razorpayKeyId || !coach.razorpayKeySecretEnc) throw new AppError(400, "Connect your Razorpay account in Settings first");

  const keySecret = decryptField(coach.razorpayKeySecretEnc);
  const link = await createPaymentLink(coach.razorpayKeyId, keySecret, {
    amount: invoice.amount, currency: invoice.currency,
    description: invoice.description || `Invoice for ${invoice.client.displayName}`,
    referenceId: invoice.id, // Razorpay requires uniqueness here; invoice.id already is
    customerName: invoice.client.displayName, customerContact: invoice.client.phone || undefined,
  });

  const updated = await invoiceRepository.updateById(invoice.id, {
    razorpayPaymentLinkId: link.id, razorpayShortUrl: link.short_url, razorpayStatus: link.status,
  });
  return serializeInvoice(await invoiceRepository.findById(updated.id));
}

// Polling-based confirmation, deliberately not webhooks — a webhook
// would need every coach to correctly configure a callback URL in their
// own Razorpay dashboard, which is a real setup burden to ask of each
// one. A manual/periodic refresh is simpler and still gives a real,
// non-honor-system confirmation of payment.
export async function refreshPaymentStatus(userId, invoiceId) {
  const { coach, invoice } = await loadOwnInvoiceOrThrow(userId, invoiceId);
  if (!invoice.razorpayPaymentLinkId) throw new AppError(400, "No payment link has been generated for this invoice yet");
  if (!coach.razorpayKeyId || !coach.razorpayKeySecretEnc) throw new AppError(400, "Razorpay is no longer connected — reconnect in Settings");

  const keySecret = decryptField(coach.razorpayKeySecretEnc);
  const link = await fetchPaymentLink(coach.razorpayKeyId, keySecret, invoice.razorpayPaymentLinkId);

  const isPaid = link.status === "paid";
  const updated = await invoiceRepository.updateById(invoice.id, {
    razorpayStatus: link.status,
    ...(isPaid ? { status: "PAID", paidAt: new Date() } : {}),
  });
  return serializeInvoice(await invoiceRepository.findById(updated.id));
}

export async function markPaidManually(userId, invoiceId) {
  const { invoice } = await loadOwnInvoiceOrThrow(userId, invoiceId);
  if (invoice.status === "PAID") throw new AppError(400, "Already marked paid");
  const updated = await invoiceRepository.updateById(invoice.id, { status: "PAID", paidAt: new Date() });
  return serializeInvoice(await invoiceRepository.findById(updated.id));
}

export async function cancelInvoice(userId, invoiceId) {
  const { invoice } = await loadOwnInvoiceOrThrow(userId, invoiceId);
  if (invoice.status === "PAID") throw new AppError(400, "Cannot cancel a paid invoice");
  const updated = await invoiceRepository.updateById(invoice.id, { status: "CANCELLED" });
  return serializeInvoice(await invoiceRepository.findById(updated.id));
}
