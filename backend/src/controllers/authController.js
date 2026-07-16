// ═══════════════════════════════════════════════════════════════════════
// AUTH CONTROLLER — the only layer here that knows Express exists. Every
// function follows the same shape: pull what's needed off `req`, call
// authService, send `res`. No business logic, no Prisma, no bcrypt — if
// you're tempted to add an if-statement that isn't about status codes,
// it belongs in authService.js instead.
// ═══════════════════════════════════════════════════════════════════════
import { validateRegisterInput, validateLoginInput } from "../validators/authValidators.js";
import * as authService from "../services/authService.js";
import { AppError } from "../lib/AppError.js";
import { logger } from "../server.js";

const requestMeta = (req) => ({ userAgent: req.headers["user-agent"], ipAddress: req.ip });

// Central place where a thrown error becomes an HTTP response. AppErrors
// carry their own status code (the service decided it); anything else is
// an unexpected bug, so it gets logged and a generic 500 goes out.
function sendError(err, res, fallbackMessage) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  }
  logger.error(fallbackMessage, { error: err.message });
  return res.status(500).json({ error: fallbackMessage });
}

export async function register(req, res) {
  try {
    const data = validateRegisterInput(req.body);
    const result = await authService.register(data, requestMeta(req));
    res.status(201).json(result);
  } catch (err) { sendError(err, res, "Registration failed"); }
}

export async function googleAuth(req, res) {
  try {
    const { credential, role } = req.body;
    const result = await authService.loginWithGoogle(credential, role, requestMeta(req));
    res.json(result);
  } catch (err) { sendError(err, res, "Google sign-in failed. Please try again."); }
}

export async function login(req, res) {
  try {
    const data = validateLoginInput(req.body);
    const result = await authService.login(data, requestMeta(req));
    res.json(result);
  } catch (err) { sendError(err, res, "Login failed"); }
}

export async function logout(req, res) {
  try {
    await authService.logout(req.user.id, req.token);
    res.json({ message: "Logged out" });
  } catch (err) { sendError(err, res, "Logout failed"); }
}

export async function refresh(req, res) {
  try {
    const tokens = await authService.refreshTokens(req.body.refreshToken);
    res.json(tokens);
  } catch (err) { sendError(err, res, "Token refresh failed"); }
}

export async function me(req, res) {
  try {
    const result = await authService.getMe(req.user.id);
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to load profile"); }
}

export async function forgotPassword(req, res) {
  try {
    const result = await authService.forgotPassword(req.body.email, req.body.phone);
    res.json(result);
  } catch (err) { sendError(err, res, "Failed to process request"); }
}

export async function resetPassword(req, res) {
  try {
    const result = await authService.resetPassword(req.body.token, req.body.password);
    res.json(result);
  } catch (err) { sendError(err, res, "Password reset failed"); }
}
