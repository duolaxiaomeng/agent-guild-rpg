const { PrismaClient } = require("@prisma/client");
const { seedDatabase } = require("../dist/prisma/seed.js");

async function main() {
  const prisma = new PrismaClient();
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log(`Database already contains ${userCount} users; seed skipped.`);
      return;
    }

    await seedDatabase(prisma);
    console.log("Seeded the empty local Docker database.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

