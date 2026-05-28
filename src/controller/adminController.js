const { errorResponse, successResponse, validationErrorResponse } = require("../utils/ErrorHandling");
const { v4: uuidv4 } = require('uuid');
const catchAsync = require("../utils/catchAsync");
const { uploadFileToSpaces, deleteFileFromSpaces } = require("../utils/FileUploader");
const prisma = require("../prismaconfig");
const { error } = require("winston");
const { getMediaDurationFromBuffer } = require("../utils/mediaDuration");



exports.AddPodcast = catchAsync(async (req, res) => {
  try {
    const { name, author, cast, description, email, language } = req.body;

    if (!name || !description) {
      return errorResponse(res, "Name and description are required", 401);
    }

    if (!req.file) {
      return errorResponse(res, "Thumbnail is required", 401);
    }

    // Upload thumbnail file to Spaces or wherever
    const thumbnailKey = await uploadFileToSpaces(req.file);

    // Build podcast data object
    const podcastData = {
      uuid: uuidv4(),
      name,
      thumbnail: thumbnailKey,
      description,
      author: author || undefined,  // Optional; Prisma default will apply if undefined
      email: email || undefined,
      language: language ? (typeof language === "string" ? JSON.parse(language) : language) : undefined,
      cast: undefined, // will be set below if valid
    };

    if (cast) {
      try {
        const castArray = typeof cast === "string" ? JSON.parse(cast) : cast;
        if (!Array.isArray(castArray)) {
          return errorResponse(res, "Cast must be an array of strings", 400);
        }
        podcastData.cast = castArray;
      } catch {
        return errorResponse(res, "Invalid Cast format. Must be a JSON array.", 400);
      }
    }

    const newPodcast = await prisma.podcast.create({ data: podcastData });

    return successResponse(res, "Podcast created successfully!", 201, newPodcast);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(res, "A podcast with this name already exists", 409);
    }
    console.error("Error in AddPodcast:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetAllPodcasts = catchAsync(async (req, res) => {
  try {
    const data = await prisma.podcast.findMany()
    // console.log("data", data)
    if (!data) {
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
      },
      include: {
        episodes: {
          orderBy: {
            createdAt: "asc", // Oldest first
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

exports.UpdatePodcast = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, author, cast, email, language } = req.body;
    // console.log("language", language);
    const dataToUpdate = {};

    if (name) dataToUpdate.name = name;
    if (description) dataToUpdate.description = description;
    if (author !== undefined) dataToUpdate.author = author;
    if (email !== undefined) dataToUpdate.email = email;
    if (language !== undefined) {
      try {
        dataToUpdate.language =
          typeof language === "string" ? JSON.parse(language) : language;
        if (!Array.isArray(dataToUpdate.language)) {
          return errorResponse(res, "language must be an array of strings", 400);
        }
      } catch {
        return errorResponse(res, "Invalid language format. Must be JSON array.", 400);
      }
    }

    if (cast !== undefined) {
      try {
        const castArray = typeof cast === "string" ? JSON.parse(cast) : cast;
        if (!Array.isArray(castArray)) {
          return errorResponse(res, "Cast must be an array of strings", 400);
        }
        dataToUpdate.cast = castArray;
      } catch {
        return errorResponse(res, "Invalid cast format. Must be JSON array.", 400);
      }
    }
    // console.log("datatoupdate", dataToUpdate);

    // Fetch existing podcast
    const existingPodcast = await prisma.podcast.findUnique({
      where: { uuid: id },
    });

    if (!existingPodcast) {
      return errorResponse(res, "Podcast not found", 404);
    }

    // Handle thumbnail update
    if (req.file) {
      const isDeleted = await deleteFileFromSpaces(existingPodcast.thumbnail);
      if (!isDeleted) {
        return errorResponse(res, "Unable to delete old thumbnail", 500);
      }
      const newThumbnailKey = await uploadFileToSpaces(req.file);
      dataToUpdate.thumbnail = newThumbnailKey;
    }

    // Update in DB
    const updated = await prisma.podcast.update({
      where: { uuid: id },
      data: dataToUpdate,
    });

    return successResponse(res, "Podcast updated successfully", 200, updated);
  } catch (error) {
    console.error("UpdatePodcast error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.DisablePodcast = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch podcast and its episodes
    const podcast = await prisma.podcast.findUnique({
      where: { uuid: id },
      include: { episodes: true },
    });

    if (!podcast) {
      return errorResponse(res, "Podcast not found", 404);
    }

    // Determine the new isDeleted state (toggle)
    const newIsDeletedState = !podcast.isDeleted;

    // Update episodes
    await prisma.episode.updateMany({
      where: { podcastId: podcast.id },
      data: { isDeleted: newIsDeletedState },
    });

    // Update podcast
    const updatedPodcast = await prisma.podcast.update({
      where: { uuid: id },
      data: { isDeleted: newIsDeletedState },
    });

    const action = newIsDeletedState ? "disabled" : "enabled";

    return successResponse(
      res,
      `Podcast and episodes ${action} successfully`,
      200,
      updatedPodcast
    );
  } catch (error) {
    console.error("DisablePodcast error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.AddEpisode = catchAsync(async (req, res) => {
  try {
    const {
      title,
      description,
      topic,
      podcastId,
      detail,
      timestamps,
      size,
      link,
      audio,
      mimefield,
      duration,
      durationInSec
    } = req.body;

    if (!title || !description || !podcastId || !detail || !link || !timestamps || !topic || !audio) {
      return errorResponse(
        res,
        "Title, description, topic, podcastId, timestamps, audio & video link are required",
        401
      );
    }

    let thumbnail = "";
    // console.log("req.files", req.files);
    if (req.files?.thumbnail) {
      thumbnail = await uploadFileToSpaces(req.files.thumbnail[0]);
    }
    // console.log("thumbnail", thumbnail);

    const episodeData = {
      uuid: uuidv4(),
      title,
      description,
      topic,
      duration: duration ? Math.round(Number(duration)) : 0,
      durationInSec: durationInSec ? Math.round(Number(durationInSec)) : 0,
      mimefield: mimefield || "",
      size:
        size !== undefined && size !== null && size !== ""
          ? BigInt(Math.round(Number(size)))
          : null,
      thumbnail,
      link,
      audio,
      podcast: {
        connect: { id: Number(podcastId) },
      },
      detail,
      timestamps,
    };

    const newEpisode = await prisma.episode.create({ data: episodeData });

    return successResponse(res, "Episode uploaded successfully", 201, newEpisode);
  } catch (error) {
    console.error("Error in AddEpisode:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetAllEpisodes = catchAsync(async (req, res) => {
  try {
    const data = await prisma.episode.findMany({
      include: {
        podcast: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
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

exports.GetEpisodeByUUID = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return errorResponse(res, "UUID is required", 400);
    }
    const file = await prisma.episode.findUnique({
      where: { uuid: id },
      include: {
        podcast: true,
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

exports.UpdateEpisode = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      topic,
      detail,
      timestamps,
      link,
      audio,
      duration,
      durationInSec,
      mimefield,
      size,
      spotifyLink,
      appleLink,
    } = req.body;

    // console.log("req.body", req.body);
    const isValidString = (val) =>
      typeof val === "string" &&
      val.trim() !== "" &&
      val.trim().toLowerCase() !== "null" &&
      val.trim().toLowerCase() !== "undefined";

    const existingEpisode = await prisma.episode.findUnique({
      where: { uuid: id },
    });

    if (!existingEpisode) {
      return errorResponse(res, "Episode not found", 404);
    }

    const updates = {};

    if (title) updates.title = title;
    if (description) updates.description = description;
    if (topic) updates.topic = topic;
    if (detail) updates.detail = detail;
    if (timestamps) updates.timestamps = timestamps;
    if (duration !== undefined) updates.duration = Math.round(Number(duration));
    if (durationInSec !== undefined) updates.durationInSec = Math.round(Number(durationInSec));
    if (mimefield !== undefined) updates.mimefield = mimefield;
    if (size !== undefined && size !== null && size !== "") updates.size = BigInt(Math.round(Number(size)));
    
    if (isValidString(spotifyLink) && spotifyLink.trim() !== existingEpisode.spotifyLink) {
      updates.spotifyLink = spotifyLink.trim();
    }
    if (isValidString(appleLink) && appleLink.trim() !== existingEpisode.appleLink) {
      updates.appleLink = appleLink.trim();
    }

    // Handle thumbnail update only if new file comes
    if (req.files?.thumbnail?.[0]) {
      const isThumbDeleted = await deleteFileFromSpaces(existingEpisode.thumbnail);
      if (!isThumbDeleted) {
        console.warn("Failed to delete old thumbnail");
      }

      const newThumbUrl = await uploadFileToSpaces(req.files.thumbnail[0]);
      updates.thumbnail = newThumbUrl;
    }

    const isValidLink =
      typeof link === "string" &&
      link.trim() !== "" &&
      link.trim().toLowerCase() !== "null" &&
      link.trim().toLowerCase() !== "undefined";

    if (isValidLink && link.trim() !== existingEpisode.link) {
      if (existingEpisode.link) {
        const isVideoDeleted = await deleteFileFromSpaces(existingEpisode.link);
        if (!isVideoDeleted) {
          console.warn("Failed to delete old video file");
        }
      }

      updates.link = link.trim();
    }

    const isValidAudio =
      typeof audio === "string" &&
      audio.trim() !== "" &&
      audio.trim().toLowerCase() !== "null" &&
      audio.trim().toLowerCase() !== "undefined";

    if (isValidAudio && audio.trim() !== existingEpisode.audio) {
      if (existingEpisode.audio) {
        const isAudioDeleted = await deleteFileFromSpaces(existingEpisode.audio);
        if (!isAudioDeleted) {
          console.warn("Failed to delete old audio file");
        }
      }

      updates.audio = audio.trim();
    }

    const updatedEpisode = await prisma.episode.update({
      where: { uuid: id },
      data: updates,
    });

    return successResponse(res, "Episode updated successfully", 200, updatedEpisode);
  } catch (error) {
    console.error("Error in UpdateEpisode:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.DeleteEpisode = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;

    const episode = await prisma.episode.findUnique({
      where: { uuid: id },
    });

    if (!episode) {
      return errorResponse(res, "Episode not found", 404);
    }

    const newIsDeletedState = !episode.isDeleted

    await prisma.episode.update({
      where: { uuid: id },
      data: { isDeleted: newIsDeletedState },
    });

    return successResponse(res, "Episode soft-deleted successfully", 200);
  } catch (error) {
    console.error("DeleteEpisode error:", error);
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

exports.DeleteCheck = catchAsync(async (req, res) => {
  try {
    const {url} = req.body;
    console.log("req.body", req.body);
    if (!url) {
      return res.status(500).json({ error: 'File URL toh bhej bhai' });
    }
    const fileKey = await deleteFileFromSpaces(url);
    if (fileKey) {
      res.status(200).json({
        status: true,
        message: "Code chal gaya"
      });
    } else {
      res.status(500).json({ 
        status: false,
        message: 'Code nhi chala' 
      });
    }
  } catch (error) {
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.AddGuide = catchAsync(async (req, res) => {
  try {    
    const { title, description, author, language, pages } = req.body;

    if (!req.files || !req.files.guide) {
      return errorResponse(res, "Guide file is required", 401);
    }

    const link = await uploadFileToSpaces(req.files.guide[0]);

    let thumbnail = "";
    if (req.files.thumbnail) {
      thumbnail = await uploadFileToSpaces(req.files.thumbnail[0]);
    }

    const newGuide = await prisma.guide.create({
      data: {
        uuid: uuidv4(),
        title,
        description,
        author: author || "The Property Portfolio Podcast",
        link,
        language: language ? (typeof language === "string" ? JSON.parse(language) : language) : undefined,
        thumbnail,
        pages: Number(pages) || null,
      },
    });

    return successResponse(res, "Guide uploaded successfully", 201, newGuide);
  } catch (error) {
    console.error("Error in AddGuide:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.UpdateGuide = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;
    const dataToUpdate = {};
    const { title, description, author, language, pages } = req.body;

    if (title) dataToUpdate.title = title;
    if (description) dataToUpdate.description = description;
    if (author !== undefined) dataToUpdate.author = author;
    if (language !== undefined) {
      dataToUpdate.language = typeof language === "string" ? JSON.parse(language) : language;
    }
    if (pages !== undefined) dataToUpdate.pages = Number(pages);

    const existingData = await prisma.guide.findUnique({
      where: { uuid: id },
    });

    if (!existingData) {
      return errorResponse(res, "Guide not found", 404);
    }

    if (req.files?.thumbnail?.[0]) {
      const isDeleted = await deleteFileFromSpaces(existingData.thumbnail);
      if (!isDeleted) {
        return errorResponse(res, "Unable to delete old thumbnail", 500);
      }
      const fileKey = await uploadFileToSpaces(req.files.thumbnail[0]);
      dataToUpdate.thumbnail = fileKey;
    }

    if (req.files?.guide?.[0]) {
      const isDeleted = await deleteFileFromSpaces(existingData.link);
      if (!isDeleted) {
        return errorResponse(res, "Unable to delete old guide file", 500);
      }
      const fileKey = await uploadFileToSpaces(req.files.guide[0]);
      dataToUpdate.link = fileKey;
    }

    const updatedGuide = await prisma.guide.update({
      where: { uuid: id },
      data: dataToUpdate,
    });

    return successResponse(res, "Guide updated successfully", 200, updatedGuide);
  } catch (error) {
    console.error("UpdateGuide error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});

exports.GetAllGuides = catchAsync(async (req, res) => {
  try {
    const data = await prisma.guide.findMany()
    if (!data) {
      return errorResponse(res, "Guides not found", 404);
    }
    successResponse(res, "Guides Retrieved successfully", 200, data);
  } catch (error) {
    console.log("Guides get error:", error);
    return errorResponse(res, error.message || "Internal Server Error", 500);
  }
});
