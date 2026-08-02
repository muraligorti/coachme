// ═══════════════════════════════════════════════════════════════════════
// PUSH REPOSITORY — pure Prisma data access for device push tokens.
// ═══════════════════════════════════════════════════════════════════════
import { prisma } from "../server.js";

// A token is unique per device, not per user — if the same physical
// device token shows up again (app reinstall, same device re-logging
// in as a different account, etc.), upsert reassigns it to whoever
// registered most recently rather than erroring on a duplicate.
export const upsertToken = (userId, token, platform, client = prisma) =>
  client.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });

export const findTokensForUser = (userId, client = prisma) =>
  client.pushToken.findMany({ where: { userId } });

// Called when Firebase reports a token is no longer valid (app
// uninstalled, token rotated, etc.) — keeps the table from accumulating
// dead tokens that would otherwise fail on every future send attempt.
export const deleteToken = (token, client = prisma) =>
  client.pushToken.deleteMany({ where: { token } }); // deleteMany (not delete) so a since-removed token doesn't throw
