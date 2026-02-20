const { errorResponse, successResponse, validationErrorResponse } = require("../utils/ErrorHandling");
const { v4: uuidv4 } = require('uuid');
const catchAsync = require("../utils/catchAsync");
const { uploadFileToSpaces, deleteFileFromSpaces } = require("../utils/FileUploader");
const prisma = require("../prismaconfig");
const { error } = require("winston");

exports.GetAllPodcasts = catchAsync(async (req, res) => {
  try {
    const data = await prisma.podcast.findMany({
      where: { isDeleted: false },
      include: {
        _count: {
          select: { episodes: true }, // count episodes for each podcast
        },
      },
    });

    if (!data || data.length === 0) {
      return errorResponse(res, "Podcasts not found", 404);
    }

    successResponse(res, "Podcasts Retrieved successfully", 200, data);
  } catch (error) {
    console.log("Podcast get error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetAllPodcastswithFiles = catchAsync(async (req, res) => {
  try {
    const data = await prisma.podcast.findMany({
      where:{
        isDeleted: false
      },
      include: {
        episodes: true, 
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    if (!data) {
      return errorResponse(res, "Podcasts not found", 404);
    }
    successResponse(res, "Podcasts Retrieved successfully", 200, data);
  } catch (error) {
    console.log("Podcast get error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.PodcastsDetail = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return errorResponse(res, "UUID is required", 400);
    }
    const data = await prisma.podcast.findUnique({
    where: {
      uuid: id,
      isDeleted: false,
    },
    include: {
      episodes: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
    if (!data) {
      return errorResponse(res, "Podcasts not found", 404);
    }
    successResponse(res, "Podcasts Retrieved successfully", 200, data);
  } catch (error) {
    console.log("Podcast get error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.HomeEpisodesGet = catchAsync(async (req, res) => {
  try {
    const data = await prisma.episode.findMany({
    where: {
      isDeleted: false,
    },
    include: {
      podcast: true, 
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 4,
  });

    if (!data || data.length === 0) {
      return errorResponse(res, "Files not found", 404);
    }

    return successResponse(res, "Files retrieved successfully", 200, data);
  } catch (error) {
    console.error("File retrieval error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetAllFiles = catchAsync(async (req, res) => {
  try {
    const { search, topic } = req.query;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 10, 100);
    const skip = (page - 1) * limit;

    const whereClause = {
      isDeleted: false,
      ...(search && search.trim() !== "" && {
        OR: [
          {
            title: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            podcast: {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
          },
        ],
      }),

      ...(topic && topic.trim() !== "" && {
        topic: {
          equals: topic,
          mode: "insensitive",
        },
      }),
    };

    const [episodes, totalCount, topics] = await Promise.all([
      prisma.episode.findMany({
        where: whereClause,
        include: {
          podcast: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),

      prisma.episode.count({
        where: whereClause,
      }),

      prisma.episode.findMany({
        distinct: ["topic"],
        select: { topic: true },
        where: {
          topic: { not: null }, isDeleted: false,
        },
      }),
    ]);

    const distinctTopics = topics.map(t => t.topic);

    return successResponse(res, "Episode retrieved successfully", 200, {
      episodes: episodes || [],
      topics: distinctTopics,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Episode retrieval error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetFileByUUID = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return errorResponse(res, "UUID is required", 400);
    }
    const file = await prisma.episode.findUnique({
      where: { uuid:id, isDeleted:false },
      include: {
        podcast: true, // Include related podcast info if needed
      },
    });
    if (!file) {
      return errorResponse(res, "File not found", 404);
    }
    return successResponse(res, "File retrieved successfully", 200, file);
  } catch (error) {
    console.error("Get file error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.UploadCheck = catchAsync(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(500).json({ error: 'File toh bhej bhai' });
    }
    const fileKey = await uploadFileToSpaces(req.file);
    if (fileKey) {
      res.status(200).json({ fileKey });
    } else {
      res.status(500).json({ error: 'Upload failed' });
    }
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.HomeGuideGet = catchAsync(async (req, res) => {
  try {
    const data = await prisma.guide.findMany({
    where: {
      isDeleted: false,
    },
    take: 4,
  });

    if (!data || data.length === 0) {
      return errorResponse(res, "Guides not found", 404);
    }
    return successResponse(res, "Guides retrieved successfully", 200, data);
  } catch (error) {
    console.error("File retrieval error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetAllGuides = catchAsync(async (req, res) => {
  try {
    let { page, limit } = req.query;

    // Default values
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;

    const skip = (page - 1) * limit;

    // Get total count
    const total = await prisma.guide.count({
      where: {
        isDeleted: false,
      },
    });

    // Get paginated data
    const data = await prisma.guide.findMany({
      where: {
        isDeleted: false,
      },
      skip,
      take: limit,
    });

    if (!data || data.length === 0) {
      return errorResponse(res, "Guides not found", 404);
    }

    return successResponse(res, "Guides retrieved successfully", 200, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      guides:data,
    });
  } catch (error) {
    console.error("File retrieval error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});