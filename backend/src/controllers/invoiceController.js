import * as invoiceService from "../services/invoiceService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

function sendError(err, res, fallback) {
  if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message });
  logger.error(fallback, { error: err.message });
  return res.status(500).json({ error: fallback });
}

export async function getRazorpayStatus(req, res) {
  try { res.json(await invoiceService.getMyRazorpayStatus(req.user.id)); }
  catch (err) { sendError(err, res, "Failed to load Razorpay status"); }
}

export async function saveRazorpayKeys(req, res) {
  try { res.json(await invoiceService.saveRazorpayKeys(req.user.id, req.body?.keyId, req.body?.keySecret)); }
  catch (err) { sendError(err, res, "Failed to save Razorpay keys"); }
}

export async function disconnectRazorpay(req, res) {
  try { res.json(await invoiceService.disconnectRazorpay(req.user.id)); }
  catch (err) { sendError(err, res, "Failed to disconnect Razorpay"); }
}

export async function create(req, res) {
  try { res.status(201).json(await invoiceService.createInvoice(req.user.id, req.body || {})); }
  catch (err) { sendError(err, res, "Failed to create invoice"); }
}

export async function list(req, res) {
  try { res.json(await invoiceService.listInvoices(req.user.id)); }
  catch (err) { sendError(err, res, "Failed to load invoices"); }
}

export async function generatePaymentLink(req, res) {
  try { res.json(await invoiceService.generatePaymentLink(req.user.id, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to generate payment link"); }
}

export async function refreshStatus(req, res) {
  try { res.json(await invoiceService.refreshPaymentStatus(req.user.id, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to check payment status"); }
}

export async function markPaid(req, res) {
  try { res.json(await invoiceService.markPaidManually(req.user.id, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to mark invoice paid"); }
}

export async function cancel(req, res) {
  try { res.json(await invoiceService.cancelInvoice(req.user.id, req.params.id)); }
  catch (err) { sendError(err, res, "Failed to cancel invoice"); }
}
