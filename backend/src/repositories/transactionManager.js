// ═══════════════════════════════════════════════════════════════════════
// TRANSACTION MANAGER — the single seam where a service is allowed to
// touch the Prisma client, and only to open a transaction boundary. This
// keeps "start a transaction" a persistence-layer concern (it belongs
// next to the repositories) while services stay Prisma-agnostic for
// everything else — they call repository functions, passing the `tx`
// client through when they need several writes to commit atomically.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

export const runTransaction = (fn) => prisma.$transaction(fn);
