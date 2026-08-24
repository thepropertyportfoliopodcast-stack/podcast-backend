const catchAsync = require("../middleware/asyncHandler");
const { successResponse, errorResponse, validationErrorResponse } = require("../utils/httpResponses");
const prisma = require("../config/database");
const { appendContactToSheet } = require("../services/googleIntegrationService");

exports.Addcontact = catchAsync(async (req, res) => {
  const { name, email, subject, message, source } = req.body;
  if (!name || !email || !subject || !message) {
    return validationErrorResponse(res, "All fields are required", "Please complete every required field.", 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    return validationErrorResponse(res, "Please enter a valid email address.", "Please enter a valid email address.", 400);
  }
  const messageWordCount = message.trim().split(/\s+/).filter(Boolean).length;
  if (messageWordCount < 30) {
    return validationErrorResponse(
      res,
      `Your message must contain at least 30 words. Please add ${30 - messageWordCount} more.`,
      `Your message must contain at least 30 words. Please add ${30 - messageWordCount} more.`,
      400
    );
  }

  const kind = /topic|suggest/i.test(subject) ? "TOPIC_SUGGESTION" : "ENQUIRY";
  let record = await prisma.contact.create({
    data: { email: email.trim().toLowerCase(), name: name.trim(), subject, message: message.trim(), kind, source: source || (kind === "TOPIC_SUGGESTION" ? "episode_page" : "contact_page") },
  });

  try {
    const sheetResult = await appendContactToSheet(record);
    if (!sheetResult.skipped) {
      record = await prisma.contact.update({ where: { id: record.id }, data: { sheetSyncedAt: new Date(), sheetSyncError: null } });
    }
  } catch (sheetError) {
    record = await prisma.contact.update({ where: { id: record.id }, data: { sheetSyncError: sheetError.message.slice(0, 1000) } });
  }

  return successResponse(res, "Contact Added successfully!", 201, record);
});

exports.Getcontact = catchAsync(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.contact.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc', // 👈 newest first
        },
      }),
      prisma.contact.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return successResponse(res, "Contact Get successfully!", 200, {
      records,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
      },
    });
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.DeleteContact = catchAsync(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return validationErrorResponse(res, "A valid enquiry ID is required", 400);
  }

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return errorResponse(res, "Enquiry not found", 404);
  }

  await prisma.contact.delete({ where: { id } });
  return successResponse(res, "Enquiry deleted successfully", 200, { id });
});

exports.RetryContactSheetSync = catchAsync(async (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return validationErrorResponse(res, "A valid enquiry ID is required", "A valid enquiry ID is required", 400);
  }

  let record = await prisma.contact.findUnique({ where: { id } });
  if (!record) return errorResponse(res, "Enquiry not found", 404);
  if (record.sheetSyncedAt) {
    return successResponse(res, "Enquiry is already synced", 200, record);
  }

  try {
    const sheetResult = await appendContactToSheet(record);
    if (sheetResult.skipped) {
      return errorResponse(res, sheetResult.reason, 503);
    }
    record = await prisma.contact.update({
      where: { id },
      data: { sheetSyncedAt: new Date(), sheetSyncError: null },
    });
    return successResponse(res, "Enquiry synced to Google Sheets", 200, record);
  } catch (sheetError) {
    const message = sheetError?.message || "Google Sheets sync failed";
    await prisma.contact.update({
      where: { id },
      data: { sheetSyncError: message.slice(0, 1000) },
    });
    return errorResponse(res, message, 502);
  }
});
