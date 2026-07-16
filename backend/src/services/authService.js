// ═══════════════════════════════════════════════════════════════════════
// AUTH SERVICE — the business-logic layer for everything auth-related.
// This is the layer that used to be tangled inside routes/auth.js: it
// decides WHAT should happen (reject disposable emails, lock accounts
// after 5 failed logins, enforce single sessions, build default
// profiles...), while repositories decide HOW to persist it and
// controllers decide how to expose it over HTTP.
//
// Rule of thumb for this file: no `req`/`res` anywhere, no raw Prisma
// calls (always through a repository), no zod (that's the validators'
// job — this file trusts its input is already shaped correctly).
// ═══════════════════════════════════════════════════════════════════════
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { AppError } from "../lib/AppError.js";
import { encryptField } from "../lib/encryption.js";
import { validateEmailDomain } from "../lib/emailValidation.js";
import * as userRepository from "../repositories/userRepository.js";
import * as profileRepository from "../repositories/profileRepository.js";
import * as sessionRepository from "../repositories/sessionRepository.js";
import { runTransaction } from "../repositories/transactionManager.js";
import * as tokenService from "./tokenService.js";
import * as notificationService from "./notificationService.js";
import { logger } from "../server.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// ─── Register ──────────────────────────────────────────────────────────

export async function register(data, requestMeta) {
  // Reject fake/typo/disposable email domains (e.g. "yahoo1.com") before
  // touching the database. Format (a@b.tld) was already checked by the validator.
  const emailCheck = await validateEmailDomain(data.email);
  if (!emailCheck.valid) {
    throw new AppError(400, emailCheck.reason, { suggestion: emailCheck.suggestion });
  }

  if (!data.profile) data.profile = { displayName: data.name || data.email.split("@")[0] };
  if (!data.profile.displayName) data.profile.displayName = data.name || data.email.split("@")[0];

  const existing = await userRepository.findByEmail(data.email);
  if (existing && existing.passwordHash !== "PENDING_INVITE") {
    throw new AppError(409, "Email already registered");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await runTransaction(async (tx) => {
    let newUser;
    if (existing && existing.passwordHash === "PENDING_INVITE") {
      // User was pre-created by a coach — claim the account
      newUser = await userRepository.updateById(existing.id, { passwordHash, role: data.role || existing.role }, tx);
      const existingProfile = data.role === "COACH"
        ? await profileRepository.findCoachProfileByUserId(existing.id, tx)
        : await profileRepository.findClientProfileByUserId(existing.id, tx);
      if (existingProfile) {
        if (data.role === "COACH") await profileRepository.updateCoachProfile(existing.id, { displayName: data.profile.displayName }, tx);
        else await profileRepository.updateClientProfile(existing.id, { displayName: data.profile.displayName }, tx);
      }
    } else {
      newUser = await userRepository.create({ email: data.email, passwordHash, role: data.role }, tx);
    }

    const hasProfile = existing ? !!(data.role === "COACH"
      ? await profileRepository.findCoachProfileByUserId(newUser.id, tx)
      : await profileRepository.findClientProfileByUserId(newUser.id, tx)) : false;

    if (!hasProfile) {
      if (data.role === "COACH") {
        const sessionTypes = [];
        if (data.profile.online !== false) sessionTypes.push("ONLINE");
        if (data.profile.inPerson) sessionTypes.push("IN_PERSON");

        await profileRepository.createCoachProfile({
          userId: newUser.id,
          displayName: data.profile.displayName,
          phone: data.profile.phone || null,
          country: data.profile.country || "",
          city: data.profile.city || "",
          specializations: data.profile.specializations || [],
          certifications: data.profile.certifications || [],
          languages: data.profile.languages || ["English"],
          experienceYears: data.profile.experienceYears || 0,
          pricePerSession: data.profile.pricePerSession || 30,
          sessionTypes: sessionTypes.length ? sessionTypes : ["ONLINE"],
          bio: data.profile.bio || null,
          instagram: data.profile.instagram || null,
          website: data.profile.website || null,
          gymName: data.profile.gymName || null,
        }, tx);
      } else {
        await profileRepository.createClientProfile({
          userId: newUser.id,
          displayName: data.profile.displayName,
          phone: data.profile.phone || null,
          age: data.profile.age || null,
          gender: data.profile.gender || null,
          heightCm: data.profile.heightCm || null,
          weightKg: data.profile.weightKg || null,
          country: data.profile.country || null,
          city: data.profile.city || null,
          fitnessGoals: data.profile.fitnessGoals || [],
        }, tx);

        if (data.profile.conditions?.length) {
          const clientProfile = await profileRepository.findClientProfileByUserId(newUser.id, tx);
          await profileRepository.createMedicalData({
            clientId: clientProfile.id,
            conditionsEnc: encryptField(JSON.stringify(data.profile.conditions)),
          }, tx);
        }
      }
    }

    const hasSub = existing ? !!(await profileRepository.findSubscriptionByUserId(newUser.id, tx)) : false;
    if (!hasSub) {
      await profileRepository.createSubscription({
        userId: newUser.id,
        tier: data.role === "COACH" ? "STARTER" : "FREE",
        maxClients: data.role === "COACH" ? 5 : 999,
      }, tx);
    }

    return newUser;
  });

  const tokens = tokenService.generateTokens(user);
  await tokenService.createSession(user, tokens, requestMeta);

  logger.info("User registered", { userId: user.id, role: data.role, email: data.email });
  return { user: { id: user.id, email: user.email, role: user.role }, ...tokens };
}

// ─── Login with Google ─────────────────────────────────────────────────

export async function loginWithGoogle(credential, role, requestMeta) {
  if (!googleClient) throw new AppError(500, "Google sign-in is not configured on this server");
  if (!credential) throw new AppError(400, "Missing Google credential");

  const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new AppError(400, "Google account has no email");
  if (!payload.email_verified) throw new AppError(400, "Google email is not verified");

  const email = payload.email.toLowerCase();
  const displayName = payload.name || email.split("@")[0];
  let user = await userRepository.findByEmail(email);

  if (!user) {
    const chosenRole = role === "COACH" ? "COACH" : "CLIENT";
    user = await runTransaction(async (tx) => {
      const newUser = await userRepository.create({
        email, passwordHash: null, googleId: payload.sub,
        avatarUrl: payload.picture || null, role: chosenRole, emailVerified: true,
      }, tx);

      if (chosenRole === "COACH") {
        await profileRepository.createCoachProfile({
          userId: newUser.id, displayName, languages: ["English"], sessionTypes: ["ONLINE"], pricePerSession: 30,
        }, tx);
      } else {
        await profileRepository.createClientProfile({ userId: newUser.id, displayName }, tx);
      }

      await profileRepository.createSubscription({
        userId: newUser.id,
        tier: chosenRole === "COACH" ? "STARTER" : "FREE",
        maxClients: chosenRole === "COACH" ? 5 : 999,
      }, tx);

      return newUser;
    });
    logger.info("User registered via Google", { userId: user.id, email });
  } else if (!user.googleId) {
    user = await userRepository.updateById(user.id, {
      googleId: payload.sub, avatarUrl: user.avatarUrl || payload.picture || null, emailVerified: true,
    });
  }

  if (!user.isActive) throw new AppError(403, "Account disabled. Contact support.");

  let profile = null;
  if (user.role === "COACH") profile = await profileRepository.findCoachProfileByUserId(user.id);
  else if (user.role === "CLIENT") profile = await profileRepository.findClientProfileByUserId(user.id);

  const tokens = tokenService.generateTokens(user);
  await userRepository.updateById(user.id, { lastLogin: new Date(), loginAttempts: 0, lockedUntil: null });
  await tokenService.invalidateOtherSessions(user.id);
  await tokenService.createSession(user, tokens, requestMeta);

  logger.info("User signed in via Google", { userId: user.id, role: user.role });
  return {
    user: { id: user.id, email: user.email, role: user.role, avatarUrl: user.avatarUrl },
    profile, ...tokens,
  };
}

// ─── Login (email/password) ─────────────────────────────────────────────

export async function login(data, requestMeta) {
  const user = await userRepository.findByEmail(data.email);
  if (!user) throw new AppError(401, "Invalid email or password");

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new AppError(423, `Account locked. Try again in ${minutesLeft} minutes.`);
  }

  if (!user.passwordHash) {
    throw new AppError(400, "This account uses Google Sign-In. Please continue with Google.");
  }

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) {
    const attempts = user.loginAttempts + 1;
    const lockData = attempts >= MAX_LOGIN_ATTEMPTS ? { lockedUntil: new Date(Date.now() + LOCKOUT_MS) } : {};
    await userRepository.updateById(user.id, { loginAttempts: attempts, ...lockData });
    logger.warn("Failed login attempt", { email: data.email, attempts });
    throw new AppError(401, "Invalid email or password");
  }

  if (!user.isActive) throw new AppError(403, "Account disabled. Contact support.");

  await userRepository.updateById(user.id, { loginAttempts: 0, lockedUntil: null, lastLogin: new Date() });

  const tokens = tokenService.generateTokens(user);
  await tokenService.invalidateOtherSessions(user.id);
  await tokenService.createSession(user, tokens, requestMeta);

  let profile = null;
  if (user.role === "COACH") profile = await profileRepository.findCoachProfileByUserId(user.id);
  else if (user.role === "CLIENT") profile = await profileRepository.findClientProfileByUserId(user.id);

  const subscription = await profileRepository.findSubscriptionByUserId(user.id);

  logger.info("User logged in", { userId: user.id, role: user.role });
  return {
    user: { id: user.id, email: user.email, role: user.role },
    profile,
    subscription: { tier: subscription?.tier || "FREE", maxClients: subscription?.maxClients || 5 },
    ...tokens,
  };
}

// ─── Logout ──────────────────────────────────────────────────────────

export async function logout(userId, token) {
  await tokenService.blacklistToken(token);
  await sessionRepository.deleteByUserAndToken(userId, token);
  logger.info("User logged out", { userId });
}

// ─── Refresh ─────────────────────────────────────────────────────────

export async function refreshTokens(refreshToken) {
  if (!refreshToken) throw new AppError(400, "Refresh token required");

  let decoded;
  try {
    decoded = tokenService.verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, "Token refresh failed");
  }

  const session = await sessionRepository.findByRefreshToken(refreshToken);
  if (!session) throw new AppError(401, "Invalid refresh token");

  const user = await userRepository.findById(decoded.userId);
  if (!user || !user.isActive) throw new AppError(401, "User not found");

  const tokens = tokenService.generateTokens(user);
  await sessionRepository.updateTokens(session.id, {
    token: tokens.accessToken, refreshToken: tokens.refreshToken,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return tokens;
}

// ─── Me ──────────────────────────────────────────────────────────────

export async function getMe(userId) {
  const user = await userRepository.findByIdBasic(userId);
  let profile = null;
  if (user.role === "COACH") profile = await profileRepository.findCoachProfileByUserId(user.id);
  else if (user.role === "CLIENT") profile = await profileRepository.findClientProfileByUserId(user.id);
  const subscription = await profileRepository.findSubscriptionByUserId(user.id);
  return { user, profile, subscription: { tier: subscription?.tier, maxClients: subscription?.maxClients } };
}

// ─── Forgot password ─────────────────────────────────────────────────

export async function forgotPassword(email, phone) {
  if (!email && !phone) throw new AppError(400, "Email or phone required");

  let user;
  if (email) user = await userRepository.findByEmail(email);
  if (!user && phone) {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "").slice(-10);
    const clientProfile = await profileRepository.findClientProfileByPhone(cleanPhone);
    if (clientProfile) user = await userRepository.findById(clientProfile.userId);
    if (!user) {
      const coachProfile = await profileRepository.findCoachProfileByPhone(cleanPhone);
      if (coachProfile) user = await userRepository.findById(coachProfile.userId);
    }
  }
  // Always report success to prevent account enumeration
  if (!user) return { message: "If this account exists, a reset code has been sent." };

  const crypto = await import("crypto");
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetCode = String(Math.floor(100000 + Math.random() * 900000));

  await userRepository.updateById(user.id, {
    resetToken: resetToken + ":" + resetCode,
    resetExpires: new Date(Date.now() + 30 * 60 * 1000),
  });
  logger.info("Password reset code generated", { email, resetCode });

  if (email && await notificationService.sendPasswordResetEmail(email, resetCode)) {
    return { message: "Reset code sent to your email." };
  }
  if (phone && await notificationService.sendPasswordResetSms(phone, resetCode)) {
    return { message: "Reset code sent via SMS." };
  }
  // No email/SMS service configured or both failed — return code directly (dev/demo mode)
  return { message: "Reset code generated (no email/SMS service configured).", code: resetCode };
}

// ─── Reset password ───────────────────────────────────────────────────

export async function resetPassword(token, password) {
  if (!token || !password) throw new AppError(400, "Token and password required");
  if (password.length < 8) throw new AppError(400, "Password must be at least 8 characters");
  if (!/[A-Z]/.test(password)) throw new AppError(400, "Password must contain an uppercase letter");
  if (!/[a-z]/.test(password)) throw new AppError(400, "Password must contain a lowercase letter");
  if (!/\d/.test(password)) throw new AppError(400, "Password must contain a number");

  const users = await userRepository.findManyWithActiveReset();
  const user = users.find((u) => {
    if (!u.resetToken) return false;
    const [fullToken, code] = u.resetToken.split(":");
    return token === u.resetToken || token === fullToken || token === code;
  });
  if (!user) throw new AppError(400, "Invalid or expired reset code");

  const passwordHash = await bcrypt.hash(password, 12);
  await userRepository.updateById(user.id, {
    passwordHash, resetToken: null, resetExpires: null, loginAttempts: 0, lockedUntil: null,
  });
  await sessionRepository.deleteAllForUser(user.id);

  logger.info("Password reset successful", { userId: user.id, email: user.email });
  return { message: "Password reset successful. You can now sign in." };
}
