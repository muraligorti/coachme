// ═══════════════════════════════════════════════════════════════════════
// TOKEN SERVICE — everything about issuing, rotating, and invalidating
// JWTs + sessions. Knows nothing about HTTP (no req/res) and nothing
// about Prisma directly — it goes through sessionRepository and
// tokenBlacklistRepository, same as any other service would.
// ═══════════════════════════════════════════════════════════════════════
import jwt from "jsonwebtoken";
import * as sessionRepository from "../repositories/sessionRepository.js";
import * as tokenBlacklistRepository from "../repositories/tokenBlacklistRepository.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BLACKLIST_TTL_SECONDS = 15 * 60;

export function generateTokens(user) {
  const payload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

// Throws jwt's own error (JsonWebTokenError / TokenExpiredError) on failure
// — callers (authService) decide how to translate that into an AppError.
export function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

export function createSession(user, tokens, requestMeta, client) {
  return sessionRepository.create({
    userId: user.id,
    token: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    userAgent: requestMeta.userAgent,
    ipAddress: requestMeta.ipAddress,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  }, client);
}

export function blacklistToken(token, ttlSeconds = BLACKLIST_TTL_SECONDS) {
  return tokenBlacklistRepository.blacklist(token, ttlSeconds);
}

// Enforces a single active session per user: wipes out any other sessions
// (any device/browser) so a new login immediately signs the old one out.
// Old access tokens are also blacklisted in Redis so they're rejected
// right away, rather than waiting for the DB session lookup on the old
// device's next request (belt-and-braces — the DB delete alone is
// already enough, since authenticate() looks up the session row by exact
// token).
export async function invalidateOtherSessions(userId) {
  const existing = await sessionRepository.findAllForUser(userId);
  if (existing.length === 0) return;
  await Promise.all(existing.map((s) => tokenBlacklistRepository.blacklist(s.token, BLACKLIST_TTL_SECONDS)));
  await sessionRepository.deleteAllForUser(userId);
}
