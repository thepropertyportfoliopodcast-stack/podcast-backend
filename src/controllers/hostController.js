const { v4: uuidv4 } = require("uuid");
const catchAsync = require("../middleware/asyncHandler");
const prisma = require("../config/database");
const { errorResponse, successResponse } = require("../utils/httpResponses");
const { uploadFileToSpaces, deleteFileFromSpaces } = require("../services/storageService");

const slugify = (value = "") => value.toString().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const hostEpisodeCardSelect = {
  uuid: true,
  slug: true,
  title: true,
  description: true,
  duration: true,
  durationInSec: true,
  thumbnail: true,
  homepageThumbnail: true,
  websiteThumbnail: true,
  createdAt: true,
  topic: true,
  episodeNumber: true,
};

exports.listHosts = catchAsync(async (req, res) => {
  try {
    const isAdminRequest = req.originalUrl.startsWith("/api/admin/");
    const hosts = await prisma.host.findMany({
      where: isAdminRequest ? undefined : { isActive: true, isGuestOnly: false },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
    return successResponse(res, "Hosts retrieved successfully", 200, hosts);
  } catch (error) {
    return errorResponse(res, error.message || "Unable to retrieve hosts", 500);
  }
});

exports.getHost = catchAsync(async (req, res) => {
  try {
    const host = await prisma.host.findFirst({ where: { OR: [{ slug: req.params.id }, { uuid: req.params.id }] } });
    if (!host) return errorResponse(res, "Host not found", 404);
    const episodes = await prisma.episode.findMany({
      where: {
        OR: [{ hostSlugs: { has: host.slug } }, { guestHostSlugs: { has: host.slug } }],
        isDeleted: false,
        publicationStatus: "PUBLISHED",
      },
      select: hostEpisodeCardSelect,
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    return successResponse(res, "Host retrieved successfully", 200, { ...host, episodes });
  } catch (error) {
    return errorResponse(res, error.message || "Unable to retrieve host", 500);
  }
});

exports.createHost = catchAsync(async (req, res) => {
  try {
    const { name, designation, shortBio, bio } = req.body;
    if (!name || !designation || !shortBio || !bio || !req.file) return errorResponse(res, "Name, designation, short bio, bio and image are required", 400);
    const image = await uploadFileToSpaces(req.file);
    if (!image) return errorResponse(res, "Host image upload failed", 500);
    const host = await prisma.host.create({ data: { uuid: uuidv4(), slug: slugify(name), name, designation, shortBio, bio, image, email: req.body.email || null, linkedinUrl: req.body.linkedinUrl || null, instagramUrl: req.body.instagramUrl || null, seoTitle: req.body.seoTitle || null, seoDescription: req.body.seoDescription || null, primaryKeyword: req.body.primaryKeyword || null, secondaryKeywords: req.body.secondaryKeywords || null, guestTag: req.body.guestTag || null, displayOrder: Number(req.body.displayOrder || 0), isGuestOnly: String(req.body.isGuestOnly).toLowerCase() === "true" } });
    return successResponse(res, "Host created successfully", 201, host);
  } catch (error) {
    return errorResponse(res, error.message || "Unable to create host", 500);
  }
});

exports.updateHost = catchAsync(async (req, res) => {
  try {
    const existing = await prisma.host.findUnique({ where: { uuid: req.params.id } });
    if (!existing) return errorResponse(res, "Host not found", 404);
    const fields = ["name", "designation", "shortBio", "bio", "email", "linkedinUrl", "instagramUrl", "seoTitle", "seoDescription", "primaryKeyword", "secondaryKeywords", "guestTag"];
    const data = {};
    fields.forEach((field) => { if (req.body[field] !== undefined) data[field] = req.body[field] || null; });
    if (req.body.name) data.slug = slugify(req.body.name);
    if (req.body.displayOrder !== undefined) data.displayOrder = Number(req.body.displayOrder || 0);
    if (req.body.isActive !== undefined) data.isActive = String(req.body.isActive) === "true";
    if (req.body.isGuestOnly !== undefined) data.isGuestOnly = String(req.body.isGuestOnly) === "true";
    if (req.file) { data.image = await uploadFileToSpaces(req.file); if (existing.image) await deleteFileFromSpaces(existing.image); }
    const host = await prisma.host.update({ where: { uuid: req.params.id }, data });
    return successResponse(res, "Host updated successfully", 200, host);
  } catch (error) {
    return errorResponse(res, error.message || "Unable to update host", 500);
  }
});
