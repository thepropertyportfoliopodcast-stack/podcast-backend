const { errorResponse, successResponse, validationErrorResponse } = require("../utils/httpResponses");
const { v4: uuidv4 } = require('uuid');
const catchAsync = require("../middleware/asyncHandler");
const { uploadFileToSpaces, deleteFileFromSpaces } = require("../services/storageService");
const prisma = require("../config/database");
const { getMediaDurationFromBuffer } = require("../services/mediaDurationService");
const { createUniqueSlug } = require("../utils/slug");

const parseStringArray = (value) => {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  } catch {
    // Accept newline-separated dashboard values.
  }
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
};

const requestFile = (req, fieldname) => Array.isArray(req.files)
  ? req.files.find((file) => file.fieldname === fieldname)
  : req.files?.[fieldname]?.[0];

const parseHeroPhones = (value) => {
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
};

const isEpisodeArtwork = (url, episode) => !url || url === episode.thumbnail || url === episode.homepageThumbnail || url === episode.websiteThumbnail;

async function syncEpisodeHeroPhones(req, episode, enabled) {
  const existing = await prisma.heroPhone.findMany({ where: { episodeId: episode.id } });
  if (!enabled) {
    await prisma.heroPhone.deleteMany({ where: { episodeId: episode.id } });
    await Promise.all(existing.flatMap((phone) => [phone.thumbnail, phone.shortVideo]).filter((url) => !isEpisodeArtwork(url, episode)).map((url) => deleteFileFromSpaces(url)));
    return [];
  }
  const definitions = parseHeroPhones(req.body.heroPhones);
  if (!definitions.length) throw new Error("Add at least one Home_Page_Hero_Phone item or turn the option off");
  const kept = new Set();
  const saved = [];
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index] || {};
    const current = definition.uuid ? existing.find((phone) => phone.uuid === definition.uuid) : null;
    const thumbnailFile = requestFile(req, `heroPhoneThumbnail_${index}`);
    const shortVideoFile = requestFile(req, `heroPhoneVideo_${index}`);
    const uploadedThumbnail = thumbnailFile ? await uploadFileToSpaces(thumbnailFile) : null;
    const uploadedShortVideo = shortVideoFile ? await uploadFileToSpaces(shortVideoFile) : null;
    const title = definition.title?.trim() || episode.title;
    const youtubeVideoUrl = definition.youtubeVideoUrl?.trim() || episode.youtubeUrl;
    if (!title || !youtubeVideoUrl) throw new Error(`Hero phone ${index + 1} needs a title and full YouTube video URL`);
    const data = {
      title,
      description: definition.description?.trim() || episode.description || null,
      thumbnail: uploadedThumbnail || current?.thumbnail || episode.homepageThumbnail || episode.thumbnail,
      shortVideo: uploadedShortVideo || (definition.removeShortVideo ? null : current?.shortVideo) || null,
      youtubeShortUrl: definition.youtubeShortUrl?.trim() || null,
      youtubeVideoUrl,
      displayOrder: index,
      isActive: definition.isActive !== false,
      episodeId: episode.id,
    };
    const phone = current
      ? await prisma.heroPhone.update({ where: { id: current.id }, data })
      : await prisma.heroPhone.create({ data: { uuid: uuidv4(), ...data } });
    kept.add(phone.id); saved.push(phone);
    const obsoleteMedia = [uploadedThumbnail && current?.thumbnail, (uploadedShortVideo || definition.removeShortVideo) && current?.shortVideo].filter((url) => !isEpisodeArtwork(url, episode));
    await Promise.all(obsoleteMedia.map((url) => deleteFileFromSpaces(url)));
  }
  const removed = existing.filter((phone) => !kept.has(phone.id));
  if (removed.length) {
    await prisma.heroPhone.deleteMany({ where: { id: { in: removed.map((phone) => phone.id) } } });
    await Promise.all(removed.flatMap((phone) => [phone.thumbnail, phone.shortVideo]).filter((url) => !isEpisodeArtwork(url, episode)).map((url) => deleteFileFromSpaces(url)));
  }
  return saved;
}



exports.AddPodcast = catchAsync(async (req, res) => {
  try {
    const { name, author, cast, description, email, language, seoTitle, seoDescription, primaryKeyword, secondaryKeywords } = req.body;

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
      slug: await createUniqueSlug(prisma, "podcast", name),
      name,
      thumbnail: thumbnailKey,
      description,
      seoTitle: seoTitle?.trim() || null,
      seoDescription: seoDescription?.trim() || null,
      primaryKeyword: primaryKeyword?.trim() || null,
      secondaryKeywords: secondaryKeywords?.trim() || null,
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
    const { name, description, author, cast, email, language, seoTitle, seoDescription, primaryKeyword, secondaryKeywords } = req.body;
    // console.log("language", language);
    const dataToUpdate = {};

    if (name) dataToUpdate.name = name;
    if (description) dataToUpdate.description = description;
    if (author !== undefined) dataToUpdate.author = author;
    if (email !== undefined) dataToUpdate.email = email;
    if (seoTitle !== undefined) dataToUpdate.seoTitle = seoTitle.trim() || null;
    if (seoDescription !== undefined) dataToUpdate.seoDescription = seoDescription.trim() || null;
    if (primaryKeyword !== undefined) dataToUpdate.primaryKeyword = primaryKeyword.trim() || null;
    if (secondaryKeywords !== undefined) dataToUpdate.secondaryKeywords = secondaryKeywords.trim() || null;
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
      youtubeUrl,
      transcript,
      topicsCovered,
      reelLinks,
      size,
      link,
      audio,
      audioSize,
      mimefield,
      duration,
      durationInSec,
      episodeNumber,
      seoTitle,
      seoDescription,
      primaryKeyword,
      secondaryKeywords
      ,hostSlugs
      ,guestHostSlugs
      ,spotifyLink
      ,publishedDate
      ,isFeatured
      ,relatedEpisodeUuids
      ,homePageHeroPhone
    } = req.body;

    if (!title || !description || !podcastId || !detail || (!link && !youtubeUrl) || !timestamps || !topic || !audio) {
      return errorResponse(
        res,
        "Title, description, topic, podcastId, timestamps, audio and a YouTube or video link are required",
        401
      );
    }

    let thumbnail = "";
    // console.log("req.files", req.files);
    const thumbnailFile = requestFile(req, "thumbnail");
    if (thumbnailFile) {
      thumbnail = await uploadFileToSpaces(thumbnailFile);
      if (!thumbnail) {
        return errorResponse(res, "RSS episode artwork upload failed. Check the configured image storage.", 502);
      }
    }
    let homepageThumbnail = null;
    const homepageThumbnailFile = requestFile(req, "homepageThumbnail");
    if (homepageThumbnailFile) {
      homepageThumbnail = await uploadFileToSpaces(homepageThumbnailFile);
      if (!homepageThumbnail) {
        return errorResponse(res, "Homepage hero image upload failed. Check the configured image storage.", 502);
      }
    }
    let websiteThumbnail = null;
    const websiteThumbnailFile = requestFile(req, "websiteThumbnail");
    if (websiteThumbnailFile) {
      websiteThumbnail = await uploadFileToSpaces(websiteThumbnailFile);
      if (!websiteThumbnail) {
        return errorResponse(res, "Website card thumbnail upload failed. Check the configured image storage.", 502);
      }
    }
    // console.log("thumbnail", thumbnail);

    const episodeData = {
      uuid: uuidv4(),
      slug: await createUniqueSlug(prisma, "episode", title),
      title,
      description,
      seoTitle: seoTitle?.trim() || null,
      seoDescription: seoDescription?.trim() || null,
      primaryKeyword: primaryKeyword?.trim() || null,
      secondaryKeywords: secondaryKeywords?.trim() || null,
      topic,
      duration: duration ? Math.round(Number(duration)) : 0,
      durationInSec: durationInSec ? Math.round(Number(durationInSec)) : 0,
      episodeNumber: episodeNumber ? Math.round(Number(episodeNumber)) : null,
      mimefield: mimefield || "",
      size:
        size !== undefined && size !== null && size !== ""
          ? BigInt(Math.round(Number(size)))
          : null,
      thumbnail,
      homepageThumbnail,
      websiteThumbnail,
      link: link || null,
      audio,
      audioStatus: audio ? "COMPLETED" : "PENDING",
      audioSize:
        audioSize !== undefined && audioSize !== null && audioSize !== ""
          ? BigInt(Math.round(Number(audioSize)))
          : null,
      podcast: {
        connect: { id: Number(podcastId) },
      },
      detail,
      timestamps,
      youtubeUrl: youtubeUrl?.trim() || null,
      transcript: transcript || null,
      topicsCovered: parseStringArray(topicsCovered),
      reelLinks: parseStringArray(reelLinks),
      hostSlugs: parseStringArray(hostSlugs),
      guestHostSlugs: parseStringArray(guestHostSlugs),
      spotifyLink: spotifyLink?.trim() || null,
      isFeatured: String(isFeatured).toLowerCase() === "true",
      relatedEpisodeUuids: parseStringArray(relatedEpisodeUuids).slice(0, 4),
      ...(publishedDate ? { createdAt: new Date(`${publishedDate}T00:00:00.000Z`) } : {}),
    };

    const newEpisode = await prisma.episode.create({ data: episodeData });
    const heroPhones = await syncEpisodeHeroPhones(req, newEpisode, String(homePageHeroPhone).toLowerCase() === "true");

    return successResponse(res, "Episode uploaded successfully", 201, { ...newEpisode, heroPhones });
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
        heroPhones: { orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] },
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
      youtubeUrl,
      transcript,
      topicsCovered,
      reelLinks,
      link,
      audio,
      audioSize,
      duration,
      durationInSec,
      episodeNumber,
      mimefield,
      size,
      spotifyLink,
      appleLink,
      seoTitle,
      seoDescription,
      primaryKeyword,
      secondaryKeywords,
      hostSlugs,
      guestHostSlugs,
      publishedDate,
      isFeatured,
      relatedEpisodeUuids,
      homePageHeroPhone,
    } = req.body;

    // console.log("req.body", req.body);
    const isValidString = (val) =>
      typeof val === "string" &&
      val.trim() !== "" &&
      val.trim().toLowerCase() !== "null" &&
      val.trim().toLowerCase() !== "undefined";

    const existingEpisode = await prisma.episode.findUnique({
      where: { uuid: id },
      include: { heroPhones: true },
    });

    if (!existingEpisode) {
      return errorResponse(res, "Episode not found", 404);
    }

    const updates = {};
    let previousRssThumbnail = null;
    let previousHomepageThumbnail = null;
    let previousWebsiteThumbnail = null;

    if (title) updates.title = title;
    if (description) updates.description = description;
    if (topic) updates.topic = topic;
    if (seoTitle !== undefined) updates.seoTitle = seoTitle.trim() || null;
    if (seoDescription !== undefined) updates.seoDescription = seoDescription.trim() || null;
    if (primaryKeyword !== undefined) updates.primaryKeyword = primaryKeyword.trim() || null;
    if (secondaryKeywords !== undefined) updates.secondaryKeywords = secondaryKeywords.trim() || null;
    if (detail) updates.detail = detail;
    if (timestamps) updates.timestamps = timestamps;
    if (youtubeUrl !== undefined) updates.youtubeUrl = youtubeUrl.trim() || null;
    if (transcript !== undefined) updates.transcript = transcript || null;
    if (topicsCovered !== undefined) updates.topicsCovered = parseStringArray(topicsCovered);
    if (reelLinks !== undefined) updates.reelLinks = parseStringArray(reelLinks);
    if (hostSlugs !== undefined) updates.hostSlugs = parseStringArray(hostSlugs);
    if (guestHostSlugs !== undefined) updates.guestHostSlugs = parseStringArray(guestHostSlugs);
    if (isFeatured !== undefined) updates.isFeatured = String(isFeatured).toLowerCase() === "true";
    if (relatedEpisodeUuids !== undefined) updates.relatedEpisodeUuids = parseStringArray(relatedEpisodeUuids).filter((uuid) => uuid !== id).slice(0, 4);
    if (duration !== undefined) updates.duration = Math.round(Number(duration));
    if (durationInSec !== undefined) updates.durationInSec = Math.round(Number(durationInSec));
    if (episodeNumber !== undefined) updates.episodeNumber = episodeNumber === "" ? null : Math.round(Number(episodeNumber));
    if (publishedDate) updates.createdAt = new Date(`${publishedDate}T00:00:00.000Z`);
    if (mimefield !== undefined) updates.mimefield = mimefield;
    if (size !== undefined && size !== null && size !== "") updates.size = BigInt(Math.round(Number(size)));
    
    if (isValidString(spotifyLink) && spotifyLink.trim() !== existingEpisode.spotifyLink) {
      updates.spotifyLink = spotifyLink.trim();
    }
    if (isValidString(appleLink) && appleLink.trim() !== existingEpisode.appleLink) {
      updates.appleLink = appleLink.trim();
    }

    // Handle thumbnail update only if new file comes
    const thumbnailFile = requestFile(req, "thumbnail");
    if (thumbnailFile) {
      const newThumbUrl = await uploadFileToSpaces(thumbnailFile);
      if (!newThumbUrl) {
        return errorResponse(res, "RSS episode artwork upload failed. The existing image was kept.", 502);
      }
      updates.thumbnail = newThumbUrl;
      previousRssThumbnail = existingEpisode.thumbnail;
    }

    const homepageThumbnailFile = requestFile(req, "homepageThumbnail");
    if (homepageThumbnailFile) {
      const newHomepageThumbnail = await uploadFileToSpaces(homepageThumbnailFile);
      if (!newHomepageThumbnail) {
        return errorResponse(res, "Homepage hero image upload failed. The existing image was kept.", 502);
      }
      updates.homepageThumbnail = newHomepageThumbnail;
      previousHomepageThumbnail = existingEpisode.homepageThumbnail;
    }

    const websiteThumbnailFile = requestFile(req, "websiteThumbnail");
    if (websiteThumbnailFile) {
      const newWebsiteThumbnail = await uploadFileToSpaces(websiteThumbnailFile);
      if (!newWebsiteThumbnail) {
        return errorResponse(res, "Website card thumbnail upload failed. The existing image was kept.", 502);
      }
      updates.websiteThumbnail = newWebsiteThumbnail;
      previousWebsiteThumbnail = existingEpisode.websiteThumbnail;
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
      updates.audioStatus = "COMPLETED";
    }
    if (audioSize !== undefined && audioSize !== null && audioSize !== "") {
      updates.audioSize = BigInt(Math.round(Number(audioSize)));
    }

    const updatedEpisode = await prisma.episode.update({
      where: { uuid: id },
      data: updates,
    });
    if (previousRssThumbnail && previousRssThumbnail !== updatedEpisode.thumbnail) {
      const oldRssThumbnailDeleted = await deleteFileFromSpaces(previousRssThumbnail);
      if (!oldRssThumbnailDeleted) console.warn("Failed to delete old RSS episode artwork");
    }
    if (previousHomepageThumbnail && previousHomepageThumbnail !== updatedEpisode.homepageThumbnail) {
      const oldHomepageThumbnailDeleted = await deleteFileFromSpaces(previousHomepageThumbnail);
      if (!oldHomepageThumbnailDeleted) console.warn("Failed to delete old homepage hero image");
    }
    if (previousWebsiteThumbnail && previousWebsiteThumbnail !== updatedEpisode.websiteThumbnail) {
      const oldWebsiteThumbnailDeleted = await deleteFileFromSpaces(previousWebsiteThumbnail);
      if (!oldWebsiteThumbnailDeleted) console.warn("Failed to delete old website card thumbnail");
    }
    const heroPhones = await syncEpisodeHeroPhones(req, updatedEpisode, homePageHeroPhone === undefined ? existingEpisode.heroPhones.length > 0 : String(homePageHeroPhone).toLowerCase() === "true");

    return successResponse(res, "Episode updated successfully", 200, { ...updatedEpisode, heroPhones });
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
      include: { heroPhones: true },
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

exports.PermanentDeleteEpisode = catchAsync(async (req, res) => {
  try {
    const { id } = req.params;

    const episode = await prisma.episode.findUnique({
      where: { uuid: id },
      include: { heroPhones: true },
    });

    if (!episode) {
      return errorResponse(res, "Episode not found", 404);
    }

    await prisma.$transaction([
      prisma.distributionStatus.deleteMany({ where: { episodeId: episode.id } }),
      prisma.episode.delete({ where: { uuid: id } }),
    ]);

    const urlsToDelete = [episode.thumbnail, episode.homepageThumbnail, episode.websiteThumbnail, episode.link, episode.audio, ...episode.heroPhones.flatMap((phone) => [phone.thumbnail, phone.shortVideo]).filter((url) => !isEpisodeArtwork(url, episode))].filter(Boolean);
    const results = await Promise.allSettled(urlsToDelete.map((url) => deleteFileFromSpaces(url)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed) console.warn("PermanentDeleteEpisode: failed to delete some files", { failed });

    return successResponse(res, "Episode permanently deleted successfully", 200);
  } catch (error) {
    console.error("PermanentDeleteEpisode error:", error);
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
