import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding FIT:OS NEXUS database...");

  // Create admin user
  const adminPass = await bcrypt.hash("Admin123!", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@fitos-nexus.com" },
    update: {},
    create: { email: "admin@fitos-nexus.com", passwordHash: adminPass, role: "ADMIN", emailVerified: true, isActive: true },
  });
  await prisma.subscription.upsert({ where: { userId: admin.id }, update: {}, create: { userId: admin.id, tier: "ELITE", maxClients: 999 } });

  // Create demo coach
  const coachPass = await bcrypt.hash("Coach123!", 12);
  const coach = await prisma.user.upsert({
    where: { email: "coach@fitos-nexus.com" },
    update: {},
    create: { email: "coach@fitos-nexus.com", passwordHash: coachPass, role: "COACH", emailVerified: true, isActive: true },
  });
  await prisma.coachProfile.upsert({
    where: { userId: coach.id }, update: {},
    create: {
      userId: coach.id, displayName: "Arjun Patel", phone: "+91 98765 43210",
      country: "India", city: "Hyderabad", bio: "NASM-certified trainer with 8 years of experience in strength & conditioning.",
      specializations: ["Strength & Conditioning", "Weight Loss", "HIIT & Cardio"],
      certifications: ["NASM-CPT", "ACE-CPT"], languages: ["English", "Hindi", "Telugu"],
      experienceYears: 8, pricePerSession: 40, sessionTypes: ["ONLINE", "IN_PERSON"],
      verified: true, verifiedAt: new Date(), rating: 4.8, reviewCount: 47, totalClients: 23,
    },
  });
  await prisma.subscription.upsert({ where: { userId: coach.id }, update: {}, create: { userId: coach.id, tier: "PRO", maxClients: 50 } });

  // Create demo client
  const clientPass = await bcrypt.hash("Client123!", 12);
  const client = await prisma.user.upsert({
    where: { email: "client@fitos-nexus.com" },
    update: {},
    create: { email: "client@fitos-nexus.com", passwordHash: clientPass, role: "CLIENT", emailVerified: true, isActive: true },
  });
  await prisma.clientProfile.upsert({
    where: { userId: client.id }, update: {},
    create: { userId: client.id, displayName: "Rahul Kumar", age: 28, gender: "male", heightCm: 175, weightKg: 78, country: "India", city: "Hyderabad", fitnessGoals: ["Weight Loss", "Muscle Gain"] },
  });
  await prisma.subscription.upsert({ where: { userId: client.id }, update: {}, create: { userId: client.id, tier: "FREE" } });

  console.log("Seed complete!");
  console.log("Demo accounts:");
  console.log("  Admin:  admin@fitos-nexus.com / Admin123!");
  console.log("  Coach:  coach@fitos-nexus.com / Coach123!");
  console.log("  Client: client@fitos-nexus.com / Client123!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
