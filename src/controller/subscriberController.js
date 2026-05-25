const catchAsync = require("../utils/catchAsync");
const { successResponse, errorResponse, validationErrorResponse } = require("../utils/ErrorHandling");
const prisma = require("../prismaconfig");

exports.AddSubscriber = catchAsync(async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return validationErrorResponse(res, "Email is required", 401);
        }
        const existing = await prisma.subscriber.findUnique({
            where: { email },
        });
        if (existing) {
            return validationErrorResponse(res, "You are already subscribed!", 409);
        }
        const record = await prisma.subscriber.create({
            data: { email },
        });
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