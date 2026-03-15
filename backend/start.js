import { execSync } from "child_process";

// Run prisma db push before starting the server
try {
  console.log("Running prisma db push...");
  const output = execSync("npx prisma db push --force-reset=false --accept-data-loss", {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK: "true" },
  });
  console.log("Prisma db push output:", output);
} catch (err) {
  console.error("Prisma db push failed (non-fatal):", err.message);
  if (err.stdout) console.log("stdout:", err.stdout);
  if (err.stderr) console.log("stderr:", err.stderr);
}

// Now start the server
console.log("Starting server...");
import("./src/server.js");
