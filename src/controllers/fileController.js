const { errorResponse, successResponse, validationErrorResponse } = require("../utils/httpResponses");
const { v4: uuidv4 } = require('uuid');
const catchAsync = require("../middleware/asyncHandler");
const { uploadFileToSpaces, deleteFileFromSpaces } = require("../services/storageService");
const prisma = require("../config/database");
const { removeEpisodeNumberFromSlug } = require("../utils/slug");

const episodeCardSelect = {
  uuid: true, slug: true, title: true, description: true,
  duration: true, durationInSec: true, youtubeUrl: true,
  thumbnail: true, homepageThumbnail: true, createdAt: true, topic: true,
  episodeNumber: true,
};

const relatedEpisodeSelect = {
  uuid: true, slug: true, title: true, thumbnail: true, homepageThumbnail: true,
  duration: true, durationInSec: true, topic: true, episodeNumber: true,
  podcast: { select: { uuid: true, slug: true, name: true, author: true } },
};

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
    const data = await prisma.podcast.findFirst({
      where: {
      OR: [{ uuid: id }, { slug: id }],
      isDeleted: false,
    },
    include: {
      episodes: {
        where: { isDeleted: false },
        select: episodeCardSelect,
        orderBy: { createdAt: "desc" },
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
    where: { isDeleted: false, isFeatured: true },
    select: episodeCardSelect,
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
  });

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
        select: episodeCardSelect,
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
          topic: { not: null },
          isDeleted: false,
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
    const cleanSlug = removeEpisodeNumberFromSlug(id);
    const file = await prisma.episode.findFirst({
      where: {
        OR: [{ uuid: id }, { slug: id }, { slug: cleanSlug }],
        isDeleted: false,
      },
      include: { podcast: { select: { uuid: true, slug: true, name: true, author: true } } },
    });
    if (!file) {
      return errorResponse(res, "File not found", 404);
    }
    const selected = Array.isArray(file.relatedEpisodeUuids) ? file.relatedEpisodeUuids.slice(0, 4) : [];
    const relatedRows = selected.length ? await prisma.episode.findMany({
      where: { uuid: { in: selected }, isDeleted: false },
      select: relatedEpisodeSelect,
    }) : [];
    const byUuid = new Map(relatedRows.map((episode) => [episode.uuid, episode]));
    const relatedEpisodes = selected.map((uuid) => byUuid.get(uuid)).filter(Boolean);
    const allHostSlugs = [...new Set([...(file.hostSlugs || []), ...(file.guestHostSlugs || [])])];
    const hostRows = allHostSlugs.length ? await prisma.host.findMany({
      where: { slug: { in: allHostSlugs }, isActive: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }) : [];
    const hostBySlug = new Map(hostRows.map((host) => [host.slug, host]));
    const hostProfiles = (file.hostSlugs || []).map((slug) => hostBySlug.get(slug)).filter(Boolean);
    const guestHostProfiles = (file.guestHostSlugs || []).map((slug) => hostBySlug.get(slug)).filter(Boolean);
    return successResponse(res, "File retrieved successfully", 200, { ...file, relatedEpisodes, hostProfiles, guestHostProfiles });
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
