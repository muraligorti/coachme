// ═══════════════════════════════════════════════════════════════════════
// ADMIN ROLE TESTS — user management, tier changes, system config
// (tier limits/specializations), impersonation, real account deletion,
// and audit logging. Admin can't self-register via the public API (by
// design - role is restricted to COACH/CLIENT there), so the test admin
// is created by registering normally then promoting directly via Prisma,
// exactly how a real admin would be created in production.
// ═══════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { getApp, getPrisma, registerAndVerify, loginAs, authHeader, cleanupTestData } from "./setup.js";

describe("Admin role", () => {
  let app, prisma, req, admin, adminHeaders;

  beforeAll(async () => {
    app = getApp(); prisma = getPrisma(); req = request(app);
    const registered = await registerAndVerify(req, { role: "COACH", profile: { displayName: "Test Admin" } });
    await prisma.user.update({ where: { id: registered.user.id }, data: { role: "ADMIN" } });
    const loggedIn = await loginAs(req, registered.email, registered.password); // re-login to get a fresh token reflecting the new role
    admin = { ...registered, token: loggedIn.token };
    adminHeaders = authHeader(admin.token);
  });

  afterAll(async () => { await cleanupTestData(prisma); });

  describe("User management", () => {
    let targetUser;
    beforeAll(async () => { targetUser = await registerAndVerify(req, { role: "COACH", profile: { displayName: "Admin Target Coach" } }); });

    it("lists users", async () => {
      const res = await req.get("/api/admin/users").set(adminHeaders);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    it("searches users by email substring - across the full result set, not just the current page", async () => {
      const res = await req.get(`/api/admin/users?search=${encodeURIComponent(targetUser.email.split("@")[0])}`).set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.users.some(u => u.email === targetUser.email)).toBe(true);
    });

    it("gets a single user's detail", async () => {
      const res = await req.get(`/api/admin/users/${targetUser.user.id}`).set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(targetUser.email);
    });

    it("updates a user's email with uniqueness validation", async () => {
      const res = await req.patch(`/api/admin/users/${targetUser.user.id}`).set(adminHeaders).send({ email: admin.email }); // duplicate
      expect(res.status).toBe(409);
    });

    it("updates a user's phone number", async () => {
      const res = await req.patch(`/api/admin/users/${targetUser.user.id}/phone`).set(adminHeaders).send({ phone: "9998887776" });
      expect(res.status).toBe(200);
    });

    it("prevents an admin from deactivating their own account", async () => {
      const res = await req.patch(`/api/admin/users/${admin.user.id}`).set(adminHeaders).send({ isActive: false });
      expect(res.status).toBe(400);
    });
  });

  describe("Tier management", () => {
    it("changes a coach's subscription tier", async () => {
      const target = await registerAndVerify(req, { role: "COACH" });
      const res = await req.patch(`/api/admin/users/${target.user.id}/tier`).set(adminHeaders).send({ tier: "PRO" });
      expect(res.status).toBe(200);
    });

    it("rejects an invalid tier value", async () => {
      const target = await registerAndVerify(req, { role: "COACH" });
      const res = await req.patch(`/api/admin/users/${target.user.id}/tier`).set(adminHeaders).send({ tier: "NOT_A_REAL_TIER" });
      expect(res.status).toBe(400);
    });
  });

  describe("System config", () => {
    it("reads current config", async () => {
      const res = await req.get("/api/admin/config").set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.tierFeatures).toBeTruthy();
      expect(res.body.specializations).toBeTruthy();
    });

    it("updates tier features and the change actually takes effect for a real account", async () => {
      const target = await registerAndVerify(req, { role: "COACH" });
      // STARTER normally blocks advancedAnalytics - flip it on and
      // confirm a real STARTER-tier account is unblocked by it.
      const configRes = await req.get("/api/admin/config").set(adminHeaders);
      const updated = { ...configRes.body.tierFeatures, STARTER: { ...configRes.body.tierFeatures.STARTER, advancedAnalytics: true } };
      const putRes = await req.put("/api/admin/config/tierFeatures").set(adminHeaders).send({ value: updated });
      expect(putRes.status).toBe(200);

      const targetHeaders = authHeader(target.token);
      const reportRes = await req.get("/api/reports/coach/revenue").set(targetHeaders);
      expect(reportRes.status).toBe(200); // was 403 before the config change

      // restore, so this test doesn't leak state into other test files
      await req.put("/api/admin/config/tierFeatures").set(adminHeaders).send({ value: configRes.body.tierFeatures });
    });

    it("rejects a malformed tierFeatures update", async () => {
      const res = await req.put("/api/admin/config/tierFeatures").set(adminHeaders).send({ value: { STARTER: { maxClients: -5 } } });
      expect(res.status).toBe(400);
    });
  });

  describe("Impersonation", () => {
    it("generates a real, working session for a target user", async () => {
      const target = await registerAndVerify(req, { role: "CLIENT" });
      const res = await req.post(`/api/admin/users/${target.user.id}/impersonate`).set(adminHeaders);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();

      const meRes = await req.get("/api/auth/me").set(authHeader(res.body.accessToken));
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.id).toBe(target.user.id);
    });

    it("refuses to impersonate another admin", async () => {
      const otherAdmin = await registerAndVerify(req, { role: "COACH" });
      await prisma.user.update({ where: { id: otherAdmin.user.id }, data: { role: "ADMIN" } });
      const res = await req.post(`/api/admin/users/${otherAdmin.user.id}/impersonate`).set(adminHeaders);
      expect(res.status).toBe(403);
    });

    it("refuses to impersonate yourself", async () => {
      const res = await req.post(`/api/admin/users/${admin.user.id}/impersonate`).set(adminHeaders);
      expect(res.status).toBe(400);
    });
  });

  describe("Account deletion", () => {
    it("permanently deletes an account with no active clients", async () => {
      const target = await registerAndVerify(req, { role: "CLIENT" });
      const res = await req.delete(`/api/admin/users/${target.user.id}`).set(adminHeaders);
      expect(res.status).toBe(200);
      const check = await prisma.user.findUnique({ where: { id: target.user.id } });
      expect(check).toBeNull();
    });

    it("prevents deleting your own account", async () => {
      const res = await req.delete(`/api/admin/users/${admin.user.id}`).set(adminHeaders);
      expect(res.status).toBe(400);
    });

    it("warns before deleting a coach with active clients, rather than deleting silently", async () => {
      const coach = await registerAndVerify(req, { role: "COACH" });
      const coachHeaders = authHeader(coach.token);
      await req.post("/api/clients").set(coachHeaders).send({ name: "Active Client", email: `active_${Date.now()}@test.coachme.internal` });

      const res = await req.delete(`/api/admin/users/${coach.user.id}`).set(adminHeaders);
      expect(res.status).toBe(409);
      expect(res.body.error || res.body.message).toBeTruthy();
    });
  });

  describe("Audit log", () => {
    it("records admin actions", async () => {
      const res = await req.get("/api/admin/audit").set(adminHeaders);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.entries)).toBe(true);
      expect(res.body.entries.length).toBeGreaterThan(0); // this suite has generated plenty of admin actions by this point
    });
  });
});
