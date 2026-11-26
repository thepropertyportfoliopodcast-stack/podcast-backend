const catchAsync = require("../middleware/asyncHandler");
const prisma = require("../config/database");
const { errorResponse, successResponse } = require("../utils/httpResponses");

exports.getEmailNotificationSettings = catchAsync(async (_req, res) => {
  const [setting, admins] = await Promise.all([
    prisma.emailNotificationSetting.findUnique({ where: { id: 1 } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "desc" }, { name: "asc" }],
    }),
  ]);
  return successResponse(res, "Email notification settings retrieved", 200, {
    admins,
    selectedAdminIds: setting?.adminIds || [],
  });
});

exports.updateEmailNotificationSettings = catchAsync(async (req, res) => {
  const rawIds = req.body?.adminIds;
  if (!Array.isArray(rawIds) || rawIds.some((id) => !Number.isInteger(Number(id)) || Number(id) < 1)) {
    return errorResponse(res, "Select valid administrator profiles", 400);
  }
  const adminIds = [...new Set(rawIds.map(Number))];
  const activeAdmins = await prisma.user.findMany({
    where: { id: { in: adminIds }, isActive: true },
    select: { id: true },
  });
  if (activeAdmins.length !== adminIds.length) {
    return errorResponse(res, "One or more selected administrator profiles are unavailable", 400);
  }
  const setting = await prisma.emailNotificationSetting.upsert({
    where: { id: 1 },
    create: { id: 1, adminIds },
    update: { adminIds },
  });
  return successResponse(res, "Email notification recipients saved", 200, { selectedAdminIds: setting.adminIds });
});
