const { Prisma } = require("@prisma/client");
const catchAsync = require("../middleware/asyncHandler");
const prisma = require("../config/database");
const { errorResponse, successResponse } = require("../utils/httpResponses");
const {
  STATUS,
  cancelEpisodeTranscription,
  enqueueEpisodeTranscription,
  enqueueExistingEpisodes,
  getTranscriptionSummary,
} = require("../services/transcriptionService");

const ALL_STATUSES = Object.values(STATUS);
const workerEnabled = () => /^(1|true|yes|on)$/i.test(process.env.WHISPERX_ENABLED || "");

async function findEpisode(identifier) {
  return prisma.episode.findFirst({
    where: { OR: [{ uuid: identifier }, { slug: identifier }] },
  });
}

exports.listEpisodeTranscripts = catchAsync(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 15));
  const search = String(req.query.search || "").trim();
  const requestedStatus = String(req.query.status || "ALL").toUpperCase();
  const where = {
    isDeleted: false,
    ...(requestedStatus !== "ALL" && ALL_STATUSES.includes(requestedStatus) ? { transcriptStatus: requestedStatus } : {}),
    ...(search ? { OR: [
      { title: { contains: search, mode: "insensitive" } },
      { slug: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };

  const [episodes, total, grouped] = await Promise.all([
    prisma.episode.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        uuid: true,
        slug: true,
        title: true,
        episodeNumber: true,
        audio: true,
        spotifyLink: true,
        transcriptStatus: true,
        transcriptLanguage: true,
        transcriptWords: true,
        transcriptError: true,
        transcriptGeneratedAt: true,
        transcriptModel: true,
        transcriptDurationMs: true,
        transcriptSyncOffsetMs: true,
        createdAt: true,
      },
    }),
    prisma.episode.count({ where }),
    prisma.episode.groupBy({ by: ["transcriptStatus"], where: { isDeleted: false }, _count: { _all: true } }),
  ]);

  const summary = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0]));
  grouped.forEach((row) => { summary[row.transcriptStatus] = row._count._all; });
  const rows = episodes.map(({ transcriptWords, ...episode }) => ({
    ...episode,
    wordCount: Array.isArray(transcriptWords) ? transcriptWords.length : 0,
  }));

  return successResponse(res, "Transcripts retrieved", 200, {
    episodes: rows,
    summary,
    worker: { enabled: workerEnabled(), processing: summary[STATUS.PROCESSING] || 0 },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1,
    },
  });
});

exports.regenerateEpisodeTranscript = catchAsync(async (req, res) => {
  const episode = await findEpisode(req.params.id);
  if (!episode) return errorResponse(res, "Episode not found", 404);
  if (!episode.audio) return errorResponse(res, "This episode has no audio file to transcribe", 400);
  if (episode.transcriptStatus === STATUS.PROCESSING) return errorResponse(res, "Cancel the active job before regenerating it", 409);
  const status = await enqueueEpisodeTranscription(episode.id, { force: true });
  return successResponse(res, "Transcript regeneration queued", 202, { status });
});

exports.cancelEpisodeTranscript = catchAsync(async (req, res) => {
  const episode = await findEpisode(req.params.id);
  if (!episode) return errorResponse(res, "Episode not found", 404);
  const cancelled = await cancelEpisodeTranscription(episode.id);
  if (!cancelled) return errorResponse(res, "Only queued or processing transcripts can be cancelled", 409);
  return successResponse(res, "Transcript job cancelled", 200, { status: STATUS.CANCELLED });
});

exports.deleteEpisodeTranscript = catchAsync(async (req, res) => {
  const episode = await findEpisode(req.params.id);
  if (!episode) return errorResponse(res, "Episode not found", 404);
  await cancelEpisodeTranscription(episode.id);
  await prisma.episode.update({
    where: { id: episode.id },
    data: {
      transcript: episode.transcriptGeneratedAt ? null : episode.transcript,
      transcriptStatus: STATUS.DELETED,
      transcriptWords: Prisma.DbNull,
      transcriptSegments: Prisma.DbNull,
      transcriptError: null,
      transcriptGeneratedAt: null,
      transcriptSourceAudio: null,
      transcriptModel: null,
      transcriptDurationMs: null,
    },
  });
  return successResponse(res, "Generated transcript data deleted. Episode audio was kept.", 200, { status: STATUS.DELETED });
});

exports.retryFailedEpisodeTranscripts = catchAsync(async (_req, res) => {
  const queued = await enqueueExistingEpisodes({ statuses: [STATUS.FAILED] });
  return successResponse(res, `${queued} failed transcript${queued === 1 ? "" : "s"} queued`, 202, { queued });
});

exports.backfillEpisodeTranscripts = catchAsync(async (req, res) => {
  const force = String(req.body?.force).toLowerCase() === "true";
  const queued = await enqueueExistingEpisodes({ force });
  return successResponse(res, `${queued} episode transcript${queued === 1 ? "" : "s"} queued`, 202, { queued });
});

exports.getEpisodeTranscriptionSummary = catchAsync(async (_req, res) => {
  return successResponse(res, "Transcription status retrieved", 200, await getTranscriptionSummary());
});
