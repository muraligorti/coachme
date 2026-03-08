// ═══════════════════════════════════════════════════════════════════════
// AUTH + RBAC MIDDLEWARE
// JWT verification, role-based access, resource ownership, rate limiting
// ═══════════════════════════════════════════════════════════════════════

import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { prisma, redis, logger } from "../server.js";

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME";

// ─── JWT Authentication ──────────────────────────────────────────────
// Verifies JWT from Authorization header or cookie
// Attaches user object to req.user

export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Bearer header or cookie
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Check if token is blacklisted (logged out)
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      return res.status(401).json({ error: "Token revoked" });
    }

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify session exists in DB
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true, role: true, isActive: true } } },
    });

    if (!session || !session.user || !session.user.isActive) {
      return res.status(401).json({ error: "Invalid session" });
    }

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ error: "Session expired" });
    }

    req.user = session.user;
    req.sessionId = session.id;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    logger.error("Auth middleware error", { error: err.message });
    return res.status(500).json({ error: "Authentication failed" });
  }
};

// ─── Role-Based Access Control ───────────────────────────────────────
// Usage: authorize("ADMIN", "COACH") — allows admin or coach
// Must be used AFTER authenticate middleware

export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      logger.warn("RBAC denied", {
        userId: req.user.id,
        role: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      return res.status(403).json({
        error: "Forbidden",
        message: `This action requires one of: ${roles.join(", ")}`,
      });
    }
    next();
  };
};

// ─── Resource Ownership Check ────────────────────────────────────────
// Ensures a coach can only access their own clients, etc.
// Admins bypass ownership checks

export const ownsResource = (resourceType) => {
  return async (req, res, next) => {
    if (req.user.role === "ADMIN") return next(); // Admins can access everything

    const resourceId = req.params.id || req.params.clientId || req.params.coachId;
    if (!resourceId) return next();

    try {
      let isOwner = false;

      switch (resourceType) {
        case "coach_profile": {
          const profile = await prisma.coachProfile.findUnique({ where: { id: resourceId } });
          isOwner = profile?.userId === req.user.id;
          break;
        }
        case "client_profile": {
          const profile = await prisma.clientProfile.findUnique({ where: { id: resourceId } });
          isOwner = profile?.userId === req.user.id;
          break;
        }
        case "coach_client": {
          // Coach can access their linked clients
          const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
          if (coachProfile) {
            const link = await prisma.clientCoach.findFirst({
              where: { coachId: coachProfile.id, clientId: resourceId },
            });
            isOwner = !!link;
          }
          break;
        }
        case "workout_session": {
          const session = await prisma.workoutSession.findUnique({
            where: { id: resourceId },
            include: { client: true },
          });
          isOwner = session?.client?.userId === req.user.id;
          break;
        }
        case "booking": {
          const booking = await prisma.booking.findUnique({ where: { id: resourceId } });
          if (booking) {
            const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
            const clientProfile = await prisma.clientProfile.findUnique({ where: { userId: req.user.id } });
            isOwner = booking.coachId === coachProfile?.id || booking.clientId === clientProfile?.id;
          }
          break;
        }
        default:
          isOwner = true;
      }

      if (!isOwner) {
        logger.warn("Ownership denied", {
          userId: req.user.id,
          resourceType,
          resourceId,
          path: req.path,
        });
        return res.status(403).json({ error: "You don't have access to this resource" });
      }

      next();
    } catch (err) {
      logger.error("Ownership check error", { error: err.message });
      return res.status(500).json({ error: "Access check failed" });
    }
  };
};

// ─── Package Feature Gate ────────────────────────────────────────────
// Checks if user's subscription tier includes the required feature

const TIER_FEATURES = {
  FREE:    { maxClients: 5,   aiCoaching: false, leadScoring: false, bulkUpload: false, advancedAnalytics: false, brandedApp: false, apiAccess: false },
  STARTER: { maxClients: 5,   aiCoaching: false, leadScoring: false, bulkUpload: false, advancedAnalytics: false, brandedApp: false, apiAccess: false },
  PRO:     { maxClients: 50,  aiCoaching: true,  leadScoring: true,  bulkUpload: true,  advancedAnalytics: true,  brandedApp: false, apiAccess: false },
  ELITE:   { maxClients: 999, aiCoaching: true,  leadScoring: true,  bulkUpload: true,  advancedAnalytics: true,  brandedApp: true,  apiAccess: true  },
  PREMIUM: { maxClients: 999, aiCoaching: true,  leadScoring: false, bulkUpload: false, advancedAnalytics: true,  brandedApp: false, apiAccess: false },
};

export const requireFeature = (feature) => {
  return async (req, res, next) => {
    if (req.user.role === "ADMIN") return next();

    const sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
    const tier = sub?.tier || "FREE";
    const features = TIER_FEATURES[tier] || TIER_FEATURES.FREE;

    if (!features[feature]) {
      return res.status(403).json({
        error: "Feature not available",
        message: `"${feature}" requires a higher subscription tier`,
        currentTier: tier,
        requiredTier: feature === "brandedApp" || feature === "apiAccess" ? "ELITE" : "PRO",
      });
    }

    req.tierFeatures = features;
    req.subscriptionTier = tier;
    next();
  };
};

// ─── Client Limit Check ─────────────────────────────────────────────

export const checkClientLimit = async (req, res, next) => {
  if (req.user.role === "ADMIN") return next();

  const sub = await prisma.subscription.findUnique({ where: { userId: req.user.id } });
  const tier = sub?.tier || "FREE";
  const maxClients = TIER_FEATURES[tier]?.maxClients || 5;

  const coachProfile = await prisma.coachProfile.findUnique({ where: { userId: req.user.id } });
  if (!coachProfile) return res.status(404).json({ error: "Coach profile not found" });

  const currentClients = await prisma.clientCoach.count({ where: { coachId: coachProfile.id, status: "active" } });

  if (currentClients >= maxClients) {
    return res.status(403).json({
      error: "Client limit reached",
      current: currentClients,
      max: maxClients,
      tier,
      message: `Your ${tier} plan allows ${maxClients} clients. Upgrade to add more.`,
    });
  }

  req.clientCount = currentClients;
  req.maxClients = maxClients;
  next();
};

// ─── Strict Rate Limiters ────────────────────────────────────────────

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn("Login rate limit exceeded", { ip: req.ip, email: req.body?.email });
    res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
  },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per IP per hour
  handler: (req, res) => {
    res.status(429).json({ error: "Too many registration attempts. Try again later." });
  },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 AI requests per minute
  handler: (req, res) => {
    res.status(429).json({ error: "AI rate limit reached. Please wait." });
  },
});

// ─── Input Sanitization ──────────────────────────────────────────────

export const sanitizeBody = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === "string") {
      return obj.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c)).trim();
    }
    if (Array.isArray(obj)) return obj.map(sanitize);
    if (obj && typeof obj === "object") {
      return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, sanitize(v)]));
    }
    return obj;
  };
  if (req.body) req.body = sanitize(req.body);
  next();
};

// ─── Audit Logging ───────────────────────────────────────────────────

export const audit = (action, resource) => {
  return async (req, res, next) => {
    // Log after response
    const originalEnd = res.end;
    res.end = function (...args) {
      prisma.auditLog.create({
        data: {
          userId: req.user?.id || null,
          action,
          resource,
          resourceId: req.params.id || null,
          ipAddress: req.ip,
          userAgent: req.headers["user-agent"],
          details: { method: req.method, path: req.path, status: res.statusCode },
        },
      }).catch((err) => logger.error("Audit log failed", { error: err.message }));
      originalEnd.apply(res, args);
    };
    next();
  };
};
