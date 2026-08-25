const bcrypt = require("bcrypt");
const catchAsync = require("../middleware/asyncHandler");
const prisma = require("../config/database");
const { errorResponse, successResponse } = require("../utils/httpResponses");
const { normalizePermissions } = require("../config/adminPermissions");

const publicUser = { id: true, name: true, email: true, role: true, permissions: true, isActive: true, createdAt: true, updatedAt: true };
const validRole = (role) => role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN";

exports.listAdmins = catchAsync(async (_req, res) => {
  const users = await prisma.user.findMany({ select: publicUser, orderBy: [{ role: "desc" }, { createdAt: "asc" }] });
  return successResponse(res, "Administrators retrieved", 200, { users });
});

exports.createAdmin = catchAsync(async (req, res) => {
  const name = req.body.name?.trim();
  const email = req.body.email?.trim().toLowerCase();
  const password = req.body.password;
  const role = validRole(req.body.role);
  if (!name || !email || typeof password !== "string" || password.length < 8) return errorResponse(res, "Name, email and a password of at least 8 characters are required", 400);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return errorResponse(res, "An administrator with this email already exists", 409);
  const user = await prisma.user.create({ data: { name, email, password: await bcrypt.hash(password, 12), role, permissions: role === "SUPER_ADMIN" ? [] : normalizePermissions(req.body.permissions), isActive: true }, select: publicUser });
  return successResponse(res, "Administrator created", 201, { user });
});

exports.updateAdmin = catchAsync(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return errorResponse(res, "Invalid administrator ID", 400);
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return errorResponse(res, "Administrator not found", 404);
  const role = req.body.role === undefined ? existing.role : validRole(req.body.role);
  const isActive = req.body.isActive === undefined ? existing.isActive : Boolean(req.body.isActive);
  if (id === req.user.id && (role !== "SUPER_ADMIN" || !isActive)) return errorResponse(res, "You cannot remove your own super-admin access or deactivate your own account", 400);
  const data = {
    ...(req.body.name !== undefined ? { name: req.body.name.trim() } : {}),
    role,
    isActive,
    permissions: role === "SUPER_ADMIN" ? [] : normalizePermissions(req.body.permissions ?? existing.permissions),
  };
  if (typeof req.body.password === "string" && req.body.password) {
    if (req.body.password.length < 8) return errorResponse(res, "Password must be at least 8 characters", 400);
    data.password = await bcrypt.hash(req.body.password, 12);
  }
  const user = await prisma.user.update({ where: { id }, data, select: publicUser });
  return successResponse(res, "Administrator updated", 200, { user });
});

exports.deleteAdmin = catchAsync(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return errorResponse(res, "Invalid administrator ID", 400);

  const existing = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!existing) return errorResponse(res, "Administrator not found", 404);
  if (existing.role === "SUPER_ADMIN") return errorResponse(res, "Super-admin accounts cannot be deleted", 403);

  const result = await prisma.user.deleteMany({ where: { id, role: "ADMIN" } });
  if (!result.count) return errorResponse(res, "This administrator can no longer be deleted", 409);

  return successResponse(res, "Administrator deleted");
});
