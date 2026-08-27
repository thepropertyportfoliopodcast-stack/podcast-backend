const catchAsync = require("../middleware/asyncHandler");
const prisma = require("../config/database");
const { errorResponse, successResponse } = require("../utils/httpResponses");
const {
  enqueueEpisodeTranscription,
  enqueueExistingEpisodes,
  getTranscriptionSummary,
} = require("../services/transcriptionService");

exports.regenerateEpisodeTranscript = catchAsync(async (req, res) => {
  const episode = await prisma.episode.findFirst({
    where: { OR: [{ uuid: req.params.id }, { slug: req.params.id }] },
    select: { id: true, audio: true },
  });
  if (!episode) return errorResponse(res, "Episode not found", 404);
  if (!episode.audio) return errorResponse(res, "This episode has no audio file to transcribe", 400);
  const status = await enqueueEpisodeTranscription(episode.id, { force: true });
  return successResponse(res, "Transcript regeneration queued", 202, { status });
});

exports.backfillEpisodeTranscripts = catchAsync(async (req, res) => {
  const force = String(req.body?.force).toLowerCase() === "true";
  const queued = await enqueueExistingEpisodes({ force });
  return successResponse(res, `${queued} episode transcript${queued === 1 ? "" : "s"} queued`, 202, { queued });
});

exports.getEpisodeTranscriptionSummary = catchAsync(async (req, res) => {
  return successResponse(res, "Transcription status retrieved", 200, await getTranscriptionSummary());
});
