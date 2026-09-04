const { v4: uuidv4 } = require("uuid");
const catchAsync = require("../middleware/asyncHandler");
const prisma = require("../config/database");
const { errorResponse, successResponse } = require("../utils/httpResponses");
const { uploadFileToSpaces, deleteFileFromSpaces } = require("../services/storageService");

const filesFrom = (req) => ({
  thumbnail: req.files?.thumbnail?.[0],
  shortVideo: req.files?.shortVideo?.[0],
});

const removeMedia = async (...urls) => {
  await Promise.all(urls.filter(Boolean).map((url) => deleteFileFromSpaces(url)));
};

exports.listPublicHeroPhones = catchAsync(async (_req, res) => {
  const linked = await prisma.heroPhone.findMany({
    where: {
      isActive: true,
      episodeId: { not: null },
      episode: { isDeleted: false, publicationStatus: "PUBLISHED" },
    },
    orderBy: [{ episode: { createdAt: "desc" } }, { createdAt: "desc" }],
    take: 3,
  });
  const fallback = linked.length < 3 ? await prisma.heroPhone.findMany({
    where: { isActive: true, episodeId: null },
    orderBy: [{ createdAt: "desc" }, { displayOrder: "asc" }],
    take: 3 - linked.length,
  }) : [];
  const phones = [...linked, ...fallback];
  return successResponse(res, "Hero phones retrieved successfully", 200, phones);
});

exports.listAdminHeroPhones = catchAsync(async (_req, res) => {
  const phones = await prisma.heroPhone.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
  return successResponse(res, "Hero phones retrieved successfully", 200, phones);
});

exports.createHeroPhone = catchAsync(async (req, res) => {
  const { thumbnail, shortVideo } = filesFrom(req);
  const title = req.body.title?.trim();
  const youtubeVideoUrl = req.body.youtubeVideoUrl?.trim();
  if (!title || !youtubeVideoUrl || !thumbnail) {
    return errorResponse(res, "Title, thumbnail and full YouTube video link are required", 400);
  }

  const uploadedThumbnail = await uploadFileToSpaces(thumbnail);
  const uploadedShortVideo = shortVideo ? await uploadFileToSpaces(shortVideo) : null;
  if (!uploadedThumbnail || (shortVideo && !uploadedShortVideo)) {
    await removeMedia(uploadedThumbnail, uploadedShortVideo);
    return errorResponse(res, "Unable to upload hero phone media", 500);
  }

  try {
    const phone = await prisma.heroPhone.create({ data: {
      uuid: uuidv4(),
      title,
      description: req.body.description?.trim() || null,
      thumbnail: uploadedThumbnail,
      shortVideo: uploadedShortVideo,
      youtubeShortUrl: req.body.youtubeShortUrl?.trim() || null,
      youtubeVideoUrl,
      displayOrder: Number(req.body.displayOrder || 0),
      isActive: req.body.isActive === undefined || String(req.body.isActive) === "true",
    } });
    return successResponse(res, "Hero phone created successfully", 201, phone);
  } catch (error) {
    await removeMedia(uploadedThumbnail, uploadedShortVideo);
    return errorResponse(res, error.message || "Unable to create hero phone", 500);
  }
});

exports.updateHeroPhone = catchAsync(async (req, res) => {
  const existing = await prisma.heroPhone.findUnique({ where: { uuid: req.params.id } });
  if (!existing) return errorResponse(res, "Hero phone not found", 404);
  const { thumbnail, shortVideo } = filesFrom(req);
  const data = {};
  ["title", "description", "youtubeShortUrl", "youtubeVideoUrl"].forEach((field) => {
    if (req.body[field] !== undefined) data[field] = req.body[field]?.trim() || null;
  });
  if (req.body.displayOrder !== undefined) data.displayOrder = Number(req.body.displayOrder || 0);
  if (req.body.isActive !== undefined) data.isActive = String(req.body.isActive) === "true";
  if (!data.youtubeVideoUrl && req.body.youtubeVideoUrl !== undefined) return errorResponse(res, "Full YouTube video link is required", 400);

  const newThumbnail = thumbnail ? await uploadFileToSpaces(thumbnail) : null;
  const newShortVideo = shortVideo ? await uploadFileToSpaces(shortVideo) : null;
  if ((thumbnail && !newThumbnail) || (shortVideo && !newShortVideo)) {
    await removeMedia(newThumbnail, newShortVideo);
    return errorResponse(res, "Unable to upload hero phone media", 500);
  }
  if (newThumbnail) data.thumbnail = newThumbnail;
  if (newShortVideo) data.shortVideo = newShortVideo;
  if (String(req.body.removeShortVideo) === "true" && !newShortVideo) data.shortVideo = null;

  try {
    const phone = await prisma.heroPhone.update({ where: { uuid: req.params.id }, data });
    await removeMedia(newThumbnail ? existing.thumbnail : null, (newShortVideo || data.shortVideo === null) ? existing.shortVideo : null);
    return successResponse(res, "Hero phone updated successfully", 200, phone);
  } catch (error) {
    await removeMedia(newThumbnail, newShortVideo);
    return errorResponse(res, error.message || "Unable to update hero phone", 500);
  }
});

exports.deleteHeroPhone = catchAsync(async (req, res) => {
  const existing = await prisma.heroPhone.findUnique({ where: { uuid: req.params.id } });
  if (!existing) return errorResponse(res, "Hero phone not found", 404);
  await prisma.heroPhone.delete({ where: { uuid: req.params.id } });
  await removeMedia(existing.thumbnail, existing.shortVideo);
  return successResponse(res, "Hero phone deleted successfully", 200, existing);
});
