// ═══════════════════════════════════════════════════════════════════════
// TEST SETUP — runs before every test file. Mocks external services
// (Resend email, Razorpay, Anthropic AI) so the suite never makes real
// network calls to third parties, and exports shared helpers every
// role's test file uses (register+verify a real user through the actual
// registration flow, login, clean the test database between runs).
//
// REQUIRES a dedicated TEST database - never point TEST_DATABASE_URL at
// production. See tests/README.md for setup.
// ═══════════════════════════════════════════════════════════════════════
import { vi, beforeAll, afterAll } from "vitest";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-not-for-production-use-only";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-not-for-production";
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0".repeat(64); // valid 64-hex-char format, test-only

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. This suite runs real writes/deletes against a database - " +
    "never point it at production. Set TEST_DATABASE_URL to a dedicated test database before running tests."
  );
}

// ── Mock email sending — captures the actual OTP code per email so
// tests can complete real registration/verification flows without ever
// hitting Resend. ──────────────────────────────────────────────────────
export const sentCodes = new Map(); // email -> most recent code sent

vi.mock("../src/lib/email.js", () => ({
  sendVerificationCodeEmail: vi.fn(async (email, code) => { sentCodes.set(email, code); }),
}));

// ── Mock Razorpay — realistic fake responses, no real API key needed. ──
vi.mock("../src/lib/razorpay.js", () => ({
  createPaymentLink: vi.fn(async (keyId, keySecret, { amount }) => ({
    id: `plink_test_${Date.now()}`, short_url: "https://rzp.io/i/test123", status: "created", amount,
  })),
  fetchPaymentLink: vi.fn(async (keyId, keySecret, paymentLinkId) => ({
    id: paymentLinkId, status: "paid", amount_paid: 1000,
  })),
}));

// ── Mock global fetch for Anthropic AI calls specifically — everything
// else (e.g. supertest's own requests) is unaffected since supertest
// talks to the app in-process, not via fetch. ──────────────────────────
const realFetch = global.fetch;
global.fetch = vi.fn((url, ...args) => {
  if (typeof url === "string" && url.includes("api.anthropic.com")) {
    return Promise.resolve({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "Mocked AI response for testing." }], usage: { input_tokens: 10, output_tokens: 10 } }),
    });
  }
  return realFetch(url, ...args);
});

let app, prisma;

beforeAll(async () => {
  const serverModule = await import("../src/server.js");
  app = serverModule.default;
  prisma = serverModule.prisma;
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

export const getApp = () => app;
export const getPrisma = () => prisma;

// ── Shared helpers ──────────────────────────────────────────────────

let counter = 0;
export const uniqueEmail = (prefix) => `${prefix}_${Date.now()}_${counter++}@test.coachme.internal`;

// Registers through the real /auth/register endpoint, retrieves the OTP
// from the mocked email capture, then completes /auth/verify-email -
// exercises the actual production code path, not a shortcut.
export async function registerAndVerify(request, { role, email, password = "TestPass123", profile = {} }) {
  const targetEmail = email || uniqueEmail(role.toLowerCase());
  const registerRes = await request.post("/api/auth/register").send({
    email: targetEmail, password, role,
    profile: { displayName: profile.displayName || `Test ${role}`, ...profile },
  });
  if (registerRes.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(registerRes.body)}`);

  const code = sentCodes.get(targetEmail);
  if (!code) throw new Error(`No verification code captured for ${targetEmail} - check the email mock`);

  const verifyRes = await request.post("/api/auth/verify-email").send({ email: targetEmail, code });
  if (verifyRes.status !== 200) throw new Error(`Verification failed: ${JSON.stringify(verifyRes.body)}`);

  return { email: targetEmail, password, token: verifyRes.body.accessToken, user: verifyRes.body.user };
}

export async function loginAs(request, identifier, password) {
  const res = await request.post("/api/auth/login").send({ identifier, password });
  if (res.status !== 200) throw new Error(`Login failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, user: res.body.user };
}

export const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

// Deletes only rows created by this suite (emails scoped to
// @test.coachme.internal) - never touches real data even if
// TEST_DATABASE_URL were accidentally misconfigured to point somewhere
// with real rows, since the email filter still applies.
export async function cleanupTestData(prismaClient) {
  const testUsers = await prismaClient.user.findMany({ where: { email: { endsWith: "@test.coachme.internal" } }, select: { id: true } });
  const ids = testUsers.map(u => u.id);
  if (ids.length) await prismaClient.user.deleteMany({ where: { id: { in: ids } } }); // cascades handle the rest
}
