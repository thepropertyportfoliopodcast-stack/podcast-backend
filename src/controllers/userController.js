const { errorResponse, successResponse, validationErrorResponse } = require("../utils/httpResponses");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const catchAsync = require("../middleware/asyncHandler");
const prisma = require("../config/database");
const { createUser, getUser } = require("../repositories/userRepository");

const signEmail = async (id) => {
  const token = jwt.sign({ id }, process.env.JWT_SECRET_KEY, {
    expiresIn: "15m",
  });
  return token;
};

exports.signup = catchAsync(async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if ( !name || !email || !password ) {
      return errorResponse(res, "All fields are required", 401);
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);
    req.body.password=hashedPassword;
    const data = await createUser(req.body);
    if (!data || !data.length) {
    return errorResponse(res, "Unable to create user", 500);
    }
    successResponse(res, "Account created successfully!", 201, data[0]);
  } catch (error) {
    // Handle Prisma error codes
    if (error.code === "P2010" && error.meta?.code === "23505") {
      return errorResponse(res, "Email already exists", 400);
    }
    // Handle missing required field (NOT NULL constraint violation)
    if (error.code === "P2010" && error.meta?.code === "23502") {
      return errorResponse(res, "Missing required field", 400);
    }
    // Handle bad data type or invalid input
    if (error.code === "P2010" && error.meta?.code === "22P02") {
      return errorResponse(res, "Invalid input data", 400);
    }
    console.log("Signup error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.login = catchAsync(async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return errorResponse(res, "All fields are required", 400);
    }
    const user = await getUser({ email });
    if (!user || !user.isActive) {
      return errorResponse(res, "Invalid email or password", 401);
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return errorResponse(res, "Invalid credentials", 401);
    }
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET_KEY,
      { expiresIn: process.env.JWT_EXPIRES_IN || "24h" }
    );
    return successResponse(res, "Login successful", 200, {
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      token: token,
    });
  } catch (error) {
    console.log("Login error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetUser = catchAsync(async (req, res) => {
  try {
    const user = req.user;
    return successResponse(res, "User retrieved successfully", 200, {
      user,
    });
  } catch (error) {
    console.log(error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.Dashboard = catchAsync(async (req, res) => {
  try {
    // Total podcasts
    const podcastCount = await prisma.podcast.count({
      where: { isDeleted: false },
    });

    // Total episodes
    const fileCount = await prisma.episode.count({
      where: { isDeleted: false },
    });

    // Average duration
    const { _avg } = await prisma.episode.aggregate({
      where: { isDeleted: false },
      _avg: {
        duration: true,
      },
    });

    // ✅ Latest 2 episodes
    const latestEpisodes = await prisma.episode.findMany({
      where: {
        isDeleted: false,
      },
      include: {
        podcast: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 2,
    });

    return successResponse(res, "Data retrieved successfully!", 200, {
      podcastCount,
      fileCount,
      averageDuration: _avg.duration || 0,
      latestEpisodes,
    });
  } catch (error) {
    console.error(error);
    return errorResponse(
      res,
      error.message || "Internal Server Error",
      500
    );
  }
});
