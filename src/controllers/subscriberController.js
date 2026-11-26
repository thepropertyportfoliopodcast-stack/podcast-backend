const catchAsync = require("../middleware/asyncHandler");
const { successResponse, errorResponse, validationErrorResponse } = require("../utils/httpResponses");
const prisma = require("../config/database");
const { notifyNewSubscriber } = require("../services/emailNotificationService");

exports.AddSubscriber = catchAsync(async (req, res) => {
    try {
        const { email } = req.body;
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
            return validationErrorResponse(res, "A valid email address is required", 400);
        }
        const existing = await prisma.subscriber.findUnique({
            where: { email: normalizedEmail },
        });
        if (existing) {
            return validationErrorResponse(res, "You are already subscribed!", 409);
        }
        const record = await prisma.subscriber.create({
            data: { email: normalizedEmail },
        });
        try {
            await notifyNewSubscriber(record);
        } catch (emailError) {
            console.error("Unable to send new subscriber notification:", emailError.message);
        }
        return successResponse(res, "Subscriber added successfully!", 201, record);
    } catch (error) {
        return errorResponse(res, error.message || "Internal Server Error", 500);
    }
});

exports.SubscriberGet = catchAsync(async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.subscriber.findMany({
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc', // 👈 newest first
        },
      }),
      prisma.subscriber.count(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return successResponse(res, "Subscriber Get successfully!", 200, {
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
