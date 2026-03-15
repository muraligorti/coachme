import { PrismaClient } from "@prisma/client";

// Run raw SQL migration to add missing columns, then start the server
const prisma = new PrismaClient();

async function migrate() {
  const columns = [
    { name: "phone", type: "TEXT" },
    { name: "notes", type: "TEXT" },
    { name: "emergencyContact", type: "TEXT" },
    { name: "address", type: "TEXT" },
    { name: "dob", type: "TEXT" },
    { name: "injuries", type: "TEXT" },
  ];

  for (const col of columns) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "ClientProfile" ADD COLUMN IF NOT EXISTS "${col.name}" ${col.type}`
      );
      console.log(`Column ${col.name}: OK`);
    } catch (err) {
      console.log(`Column ${col.name}: ${err.message.includes("already exists") ? "exists" : err.message}`);
    }
  }

  await prisma.$disconnect();
  console.log("Migration done. Starting server...");
}

migrate()
  .then(() => import("./src/server.js"))
  .catch((err) => {
    console.error("Migration failed:", err.message);
    import("./src/server.js");
  });
