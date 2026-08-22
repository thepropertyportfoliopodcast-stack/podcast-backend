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
  const result = await prisma.$queryRaw`
    SELECT * FROM "User" WHERE email=${email};
  `;
  return result[0];
};