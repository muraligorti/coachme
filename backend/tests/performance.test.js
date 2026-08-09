// ═══════════════════════════════════════════════════════════════════════
// PERFORMANCE TESTS — not a full load-testing setup (that needs a real
// deployed instance and a tool like k6/Artillery, run separately from
// this suite) - these are lightweight, in-process checks that run
// alongside the functional suite: response-time budgets on real
// endpoints, and concurrent-request handling. Enough to catch an
// endpoint that's gotten dramatically slower or breaks under
// concurrent load, without needing separate infrastructure.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { getApp, getPrisma, registerAndVerify, authHeader, cleanupTestData, uniqueEmail } from "./setup.js";

const timed = async (fn) => {
  const start = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - start };
};

describe("Performance", () => {
  let app, prisma, req, coach, coachHeaders;

  beforeAll(async () => {
    app = getApp(); prisma = getPrisma(); req = request(app);
    coach = await registerAndVerify(req, { role: "COACH", profile: { displayName: "Perf Test Coach" } });
    coachHeaders = authHeader(coach.token);
    // Default STARTER tier caps at 5 clients - bump this test account to
    // PRO directly so seeding 20 real clients below doesn't silently
    // 403 on clients 6-20 and undercut what this test is meant to measure.
    await prisma.subscription.update({ where: { userId: coach.user.id }, data: { tier: "PRO", maxClients: 999 } });
    // Seed a realistic amount of data so list/search endpoints aren't
    // just measuring an empty-table best case.
    for (let i = 0; i < 20; i++) {
      const res = await req.post("/api/clients").set(coachHeaders).send({ name: `Perf Client ${i}`, email: uniqueEmail(`perf_${i}`) });
      if (res.status !== 201) throw new Error(`Failed to seed perf test client ${i}: ${JSON.stringify(res.body)}`);
    }
  });

  afterAll(async () => { await cleanupTestData(prisma); });

  describe("Response time budgets", () => {
    it("client list responds within 1s with 20 real clients", async () => {
      const { result, ms } = await timed(() => req.get("/api/clients").set(coachHeaders));
      expect(result.status).toBe(200);
      expect(ms).toBeLessThan(1000);
    });

    it("login responds within 1.5s (bcrypt is deliberately slow, budget accordingly)", async () => {
      const { result, ms } = await timed(() => req.post("/api/auth/login").send({ identifier: coach.email, password: coach.password }));
      expect(result.status).toBe(200);
      expect(ms).toBeLessThan(1500);
    });

    it("dashboard reports endpoint responds within 1s", async () => {
      const { result, ms } = await timed(() => req.get("/api/reports/coach/dashboard").set(coachHeaders));
      expect(result.status).toBe(200);
      expect(ms).toBeLessThan(1000);
    });
  });

  describe("Concurrent request handling", () => {
    it("handles 20 concurrent client-list requests without errors or serious slowdown", async () => {
      const start = performance.now();
      const results = await Promise.all(Array.from({ length: 20 }, () => req.get("/api/clients").set(coachHeaders)));
      const totalMs = performance.now() - start;

      expect(results.every(r => r.status === 200)).toBe(true);
      // 20 concurrent requests shouldn't take dramatically longer than
      // a handful of sequential ones - generous budget since this runs
      // against a real (possibly remote) test database, not localhost.
      expect(totalMs).toBeLessThan(5000);
    });

    it("handles 10 concurrent registrations without duplicate accounts or race conditions", async () => {
      const emails = Array.from({ length: 10 }, (_, i) => uniqueEmail(`race_${i}`));
      const results = await Promise.all(emails.map(email =>
        req.post("/api/auth/register").send({ email, password: "TestPass123", role: "CLIENT", profile: { displayName: "Race Test" } })
      ));
      expect(results.every(r => r.status === 201)).toBe(true);

      const users = await prisma.user.findMany({ where: { email: { in: emails } } });
      expect(users.length).toBe(10); // no duplicates, no lost writes
    });

    it("correctly serializes concurrent check-ins for the same client on the same day (unique constraint holds)", async () => {
      const client = await registerAndVerify(req, { role: "CLIENT" });
      const clientHeaders = authHeader(client.token);
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => req.post("/api/checkins").set(clientHeaders).send({ mood: "good", energy: i + 1 }))
      );
      // All should succeed (it's an upsert on clientId+date) - the
      // important thing is no crash, no duplicate rows.
      expect(results.every(r => r.status === 201)).toBe(true);
      const checkins = await prisma.checkIn.findMany({ where: { client: { userId: client.user.id } } });
      expect(checkins.length).toBe(1); // upserted to one row for today, not five
    });
  });
});
