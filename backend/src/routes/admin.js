import { Router } from "express";
import { prisma, logger } from "../server.js";
import { authenticate, authorize, audit } from "../middleware/auth.js";
const router = Router();

// GET /api/admin/users — All users
router.get("/users", authenticate, authorize("ADMIN"), async (req, res) => {
  const { page = 1, limit = 50, role } = req.query;
  const where = role ? { role } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip: (page-1)*limit, take: parseInt(limit), select: { id: true, email: true, role: true, isActive: true, createdAt: true, lastLogin: true }, orderBy: { createdAt: "desc" } }),
    prisma.user.count({ where }),
  ]);
  res.json({ users, total });
});

// PATCH /api/admin/users/:id — Toggle active, change role
router.patch("/users/:id", authenticate, authorize("ADMIN"), audit("admin_update_user", "user"), async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive, role: req.body.role } });
  res.json({ id: user.id, email: user.email, role: user.role, isActive: user.isActive });
});

// GET /api/admin/audit — Audit logs
router.get("/audit", authenticate, authorize("ADMIN"), async (req, res) => {
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: { select: { email: true, role: true } } } });
  res.json(logs);
});

export default router;
