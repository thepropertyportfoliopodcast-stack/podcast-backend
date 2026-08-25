const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "utsav@proowrx.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || "Utsav";

  if (!password || password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be set and contain at least 8 characters");
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: { name, password: hashedPassword, role: "SUPER_ADMIN", permissions: [], isActive: true },
    create: { name, email, password: hashedPassword, role: "SUPER_ADMIN", permissions: [], isActive: true },
  });
  console.log(`Super admin ${email} is ready`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    await prisma.$disconnect();
    process.exitCode = 1;
    throw e;
  });

