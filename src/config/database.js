// Shared Prisma client used by repositories and controllers.
const { PrismaClient } = require('@prisma/client');

let prisma;

if (!global._prisma) {
  global._prisma = new PrismaClient();
}

prisma = global._prisma;

module.exports = prisma;
