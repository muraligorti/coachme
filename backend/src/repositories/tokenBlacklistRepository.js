// ═══════════════════════════════════════════════════════════════════════
// TOKEN BLACKLIST REPOSITORY — pure Redis data access. Isolating this
// behind a repository (same as the Prisma ones) means tokenService.js
// never imports the Redis client directly, and the caching mechanism
// could be swapped later without touching any business logic.
// ═══════════════════════════════════════════════════════════════════════
import { redis } from "../server.js";

export const blacklist = (token, ttlSeconds) =>
  redis.set(`blacklist:${token}`, "1", "EX", ttlSeconds);

export const isBlacklisted = (token) =>
  redis.get(`blacklist:${token}`);
