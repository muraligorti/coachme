// ═══════════════════════════════════════════════════════════════════════
// CLIENT ROLE TESTS — registration, self-submitted check-ins, progress
// view (including that coach-entered check-ins show up automatically),
// and authorization boundaries (clients can't reach coach-only routes).
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { getApp, getPrisma, registerAndVerify, authHeader, cleanupTestData, uniqueEmail } from "./setup.js";

describe("Client role", () => {
  let app, prisma, req, client, clientHeaders;

  beforeAll(async () => {
    app = getApp(); prisma = getPrisma(); req = request(app);
    client = await registerAndVerify(req, { role: "CLIENT", profile: { displayName: "Test Client" } });
    clientHeaders = authHeader(client.token);
  });

  afterAll(async () => { await cleanupTestData(prisma); });

  describe("Registration & login", () => {
    it("registers and verifies successfully", () => {
      expect(client.token).toBeTruthy();
      expect(client.user.role).toBe("CLIENT");
    });

    it("logs in with username after setting one", async () => {
      const username = `testuser_${Date.now()}`;
      const setRes = await req.put("/api/auth/username").set(clientHeaders).send({ username });
      expect(setRes.status).toBe(200);
      const loginRes = await req.post("/api/auth/login").send({ identifier: username, password: client.password });
      expect(loginRes.status).toBe(200);
    });

    it("rejects a duplicate username", async () => {
      const other = await registerAndVerify(req, { role: "CLIENT" });
      const username = `dupe_${Date.now()}`;
      await req.put("/api/auth/username").set(authHeader(other.token)).send({ username });
      const res = await req.put("/api/auth/username").set(clientHeaders).send({ username });
      expect(res.status).toBe(409);
    });
  });

  describe("Self-submitted check-ins", () => {
    it("submits their own check-in", async () => {
      const res = await req.post("/api/checkins").set(clientHeaders).send({ mood: "great", energy: 8, sleep: 7, stress: 2, adherence: 90, weight: 68 });
      expect(res.status).toBe(201);
    });

    it("rejects an out-of-range value", async () => {
      const res = await req.post("/api/checkins").set(clientHeaders).send({ energy: 15 }); // valid range is 1-10
      expect(res.status).toBe(400);
    });

    it("lists their own check-in history, including ones a coach logged for them", async () => {
      // Set up a real coach with this client on their roster, then have
      // the coach log a check-in - this is the actual scenario PR #40
      // was built for: coach-entered data should show up automatically.
      const coach = await registerAndVerify(req, { role: "COACH" });
      const coachHeaders = authHeader(coach.token);
      const addRes = await req.post("/api/clients").set(coachHeaders).send({ name: "Roster Test", email: client.email });
      expect([200, 201]).toContain(addRes.status);

      const coachCheckinRes = await req.post(`/api/checkins/client/${addRes.body.client?.id}`).set(coachHeaders).send({ mood: "okay", energy: 5, notes: "Logged live during session" });
      expect(coachCheckinRes.status).toBe(201);

      const listRes = await req.get("/api/checkins").set(clientHeaders);
      expect(listRes.status).toBe(200);
      const notes = (listRes.body.checkIns || []).map(c => c.notes);
      expect(notes).toContain("Logged live during session");
    });
  });

  describe("Authorization boundaries", () => {
    it("rejects a client trying to call a coach-only endpoint", async () => {
      const res = await req.post("/api/clients").set(clientHeaders).send({ name: "Should Fail", email: uniqueEmail("shouldfail") });
      expect(res.status).toBe(403);
    });

    it("rejects a client submitting a check-in on behalf of another client", async () => {
      const otherClient = await registerAndVerify(req, { role: "CLIENT" });
      const res = await req.post(`/api/checkins/client/${otherClient.user.id}`).set(clientHeaders).send({ mood: "good" });
      expect([401, 403, 404]).toContain(res.status);
    });

    it("rejects access to admin-only routes", async () => {
      const res = await req.get("/api/admin/users").set(clientHeaders);
      expect(res.status).toBe(403);
    });
  });
});
