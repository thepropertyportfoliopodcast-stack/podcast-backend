const prisma = require("../config/database");

exports.createUser = async (data) => {
  const { name, email, password } = data;
  const result = await prisma.$queryRaw`
    INSERT INTO "User" (name, email, password)
    VALUES (${name}, ${email}, ${password})
    RETURNING *;
  `;
  return result;
};

exports.getUser = async (data) => {
  const { email } = data;
  return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
};
