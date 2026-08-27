const { spawn } = require("child_process");
const fs = require("fs");
const fsPromises = require("fs/promises");
const os = require("os");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const prisma = require("../config/database");

const STATUS = Object.freeze({
  PENDING: "PENDING",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  UNAVAILABLE: "UNAVAILABLE",
  CANCELLED: "CANCELLED",
  DELETED: "DELETED",
});

let started = false;
let running = false;
let timer = null;
let activeJob = null;

const envBoolean = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const enabled = () => envBoolean("WHISPERX_ENABLED", false);
const pollingMs = () => Math.max(2000, Number(process.env.WHISPERX_POLL_INTERVAL_MS) || 15000);
const truncateError = (error) => String(error?.message || error || "Unknown transcription error").slice(0, 4000);

function schedule(delay = 0) {
  if (!started || !enabled() || timer) return;
  timer = setTimeout(() => {
    timer = null;
    processNext().catch((error) => console.error("WhisperX queue error:", error));
  }, delay);
  timer.unref?.();
}

async function downloadAudio(audioUrl, destination) {
  const timeoutMs = Math.max(60000, Number(process.env.WHISPERX_DOWNLOAD_TIMEOUT_MS) || 1800000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(audioUrl, { redirect: "follow", signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Audio download returned HTTP ${response.status}`);
    const contentLength = Number(response.headers.get("content-length")) || 0;
    const maxBytes = Math.max(1, Number(process.env.WHISPERX_MAX_AUDIO_BYTES) || (1024 * 1024 * 1024));
    if (contentLength > maxBytes) throw new Error(`Audio file is larger than the ${maxBytes}-byte transcription limit`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(destination));
  } finally {
    clearTimeout(timeout);
  }
}

function runPython(args, timeoutMs, episodeId) {
  return new Promise((resolve, reject) => {
    const python = process.env.WHISPERX_PYTHON || (process.platform === "win32" ? "python" : "python3");
    const child = spawn(python, args, { cwd: path.resolve(__dirname, "../.."), env: process.env, windowsHide: true });
    activeJob = { episodeId, child };
    let stderr = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      if (activeJob?.child === child) activeJob = null;
      callback(value);
    };
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-12000);
      if (envBoolean("WHISPERX_VERBOSE", false)) process.stderr.write(chunk);
    });
    child.stdout.on("data", (chunk) => {
      if (envBoolean("WHISPERX_VERBOSE", false)) process.stdout.write(chunk);
    });
    child.once("error", (error) => finish(reject, error));
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(reject, new Error(`WhisperX exceeded its ${Math.round(timeoutMs / 60000)} minute time limit`));
    }, timeoutMs);
    child.once("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) finish(resolve);
      else finish(reject, new Error(stderr.trim() || `WhisperX exited with code ${code}`));
    });
  });
}

async function transcribeEpisode(episode) {
  const temporaryDirectory = await fsPromises.mkdtemp(path.join(os.tmpdir(), `podcast-whisperx-${episode.id}-`));
  const audioPath = path.join(temporaryDirectory, "episode-audio");
  const outputPath = path.join(temporaryDirectory, "transcript.json");
  try {
    await downloadAudio(episode.audio, audioPath);
    const scriptPath = path.resolve(__dirname, "../../scripts/whisperx_transcribe.py");
    const model = process.env.WHISPERX_MODEL || "small.en";
    const language = process.env.WHISPERX_LANGUAGE || "en";
    const device = process.env.WHISPERX_DEVICE || "cpu";
    const computeType = process.env.WHISPERX_COMPUTE_TYPE || (device === "cuda" ? "float16" : "int8");
    const args = [
      scriptPath,
      "--audio", audioPath,
      "--output", outputPath,
      "--model", model,
      "--language", language,
      "--device", device,
      "--compute-type", computeType,
      "--batch-size", String(Math.max(1, Number(process.env.WHISPERX_BATCH_SIZE) || (device === "cuda" ? 8 : 4))),
      "--threads", String(Math.max(1, Number(process.env.WHISPERX_CPU_THREADS) || 1)),
    ];
    if (envBoolean("WHISPERX_DIARIZE", false)) {
      args.push("--diarize", "--hf-token", process.env.WHISPERX_HF_TOKEN || "");
      if (process.env.WHISPERX_MIN_SPEAKERS) args.push("--min-speakers", process.env.WHISPERX_MIN_SPEAKERS);
      if (process.env.WHISPERX_MAX_SPEAKERS) args.push("--max-speakers", process.env.WHISPERX_MAX_SPEAKERS);
    }
    const jobTimeoutMs = Math.max(300000, Number(process.env.WHISPERX_JOB_TIMEOUT_MS) || 21600000);
    await runPython(args, jobTimeoutMs, episode.id);
    const payload = JSON.parse(await fsPromises.readFile(outputPath, "utf8"));
    if (!Array.isArray(payload.words) || !payload.words.length) throw new Error("WhisperX produced no word timings");
    return payload;
  } finally {
    await fsPromises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function claimNextEpisode() {
  const episode = await prisma.episode.findFirst({
    where: { transcriptStatus: STATUS.QUEUED, isDeleted: false, audio: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (!episode) return null;
  if (!episode.audio?.trim()) {
    await prisma.episode.update({
      where: { id: episode.id },
      data: { transcriptStatus: STATUS.UNAVAILABLE, transcriptError: "No episode audio is available" },
    });
    return claimNextEpisode();
  }
  const claimed = await prisma.episode.updateMany({
    where: { id: episode.id, transcriptStatus: STATUS.QUEUED },
    data: { transcriptStatus: STATUS.PROCESSING, transcriptError: null },
  });
  return claimed.count === 1 ? episode : null;
}

async function processNext() {
  if (running || !enabled()) return;
  running = true;
  try {
    const episode = await claimNextEpisode();
    if (!episode) return;
    console.log(`WhisperX processing episode ${episode.id}: ${episode.title}`);
    try {
      const result = await transcribeEpisode(episode);
      const existingTranscriptIsGenerated = Boolean(episode.transcriptGeneratedAt);
      const saved = await prisma.episode.updateMany({
        where: { id: episode.id, transcriptStatus: STATUS.PROCESSING },
        data: {
          transcript: !episode.transcript?.trim() || existingTranscriptIsGenerated ? result.text : episode.transcript,
          transcriptStatus: STATUS.READY,
          transcriptLanguage: result.language || "en",
          transcriptWords: result.words,
          transcriptSegments: result.segments || [],
          transcriptError: null,
          transcriptGeneratedAt: new Date(),
          transcriptSourceAudio: episode.audio,
          transcriptModel: result.model || process.env.WHISPERX_MODEL || "small.en",
          transcriptDurationMs: Number(result.durationMs) || null,
        },
      });
      if (saved.count) console.log(`WhisperX completed episode ${episode.id} with ${result.words.length} aligned words`);
      else console.log(`WhisperX result discarded because episode ${episode.id} was cancelled or deleted`);
    } catch (error) {
      console.error(`WhisperX failed for episode ${episode.id}:`, error);
      await prisma.episode.updateMany({
        where: { id: episode.id, transcriptStatus: STATUS.PROCESSING },
        data: { transcriptStatus: STATUS.FAILED, transcriptError: truncateError(error) },
      }).catch(() => {});
    }
  } finally {
    running = false;
    schedule(pollingMs());
  }
}

async function enqueueEpisodeTranscription(episodeId, { force = false } = {}) {
  const episode = await prisma.episode.findUnique({ where: { id: Number(episodeId) } });
  if (!episode) throw new Error("Episode not found");
  if (!episode.audio?.trim()) {
    await prisma.episode.update({ where: { id: episode.id }, data: { transcriptStatus: STATUS.UNAVAILABLE, transcriptError: "No episode audio is available" } });
    return STATUS.UNAVAILABLE;
  }
  if (!force && episode.transcriptStatus === STATUS.READY && episode.transcriptSourceAudio === episode.audio) return STATUS.READY;
  await prisma.episode.update({
    where: { id: episode.id },
    data: {
      transcriptStatus: STATUS.QUEUED,
      transcriptError: null,
      ...(force || episode.transcriptSourceAudio !== episode.audio ? {
        transcriptSourceAudio: null,
        transcriptModel: null,
        transcriptDurationMs: null,
      } : {}),
    },
  });
  schedule(0);
  return STATUS.QUEUED;
}

async function enqueueExistingEpisodes({ force = false, statuses } = {}) {
  const eligibleStatuses = Array.isArray(statuses) && statuses.length
    ? statuses
    : [STATUS.PENDING, STATUS.UNAVAILABLE];
  const where = {
    isDeleted: false,
    audio: { not: null },
    ...(force ? {} : { transcriptStatus: { in: eligibleStatuses } }),
  };
  const result = await prisma.episode.updateMany({
    where,
    data: {
      transcriptStatus: STATUS.QUEUED,
      transcriptError: null,
      ...(force ? {
        transcriptSourceAudio: null,
        transcriptModel: null,
        transcriptDurationMs: null,
      } : {}),
    },
  });
  schedule(0);
  return result.count;
}

async function cancelEpisodeTranscription(episodeId) {
  const id = Number(episodeId);
  const result = await prisma.episode.updateMany({
    where: { id, transcriptStatus: { in: [STATUS.QUEUED, STATUS.PROCESSING] } },
    data: { transcriptStatus: STATUS.CANCELLED, transcriptError: null },
  });
  if (activeJob?.episodeId === id) activeJob.child.kill("SIGTERM");
  schedule(0);
  return result.count > 0;
}

async function startTranscriptionWorker() {
  if (started) return;
  started = true;
  if (!enabled()) {
    console.log("WhisperX worker is disabled. Set WHISPERX_ENABLED=true after installing requirements-whisperx.txt.");
    return;
  }
  await prisma.episode.updateMany({
    where: { transcriptStatus: STATUS.PROCESSING },
    data: { transcriptStatus: STATUS.QUEUED, transcriptError: "Transcription worker restarted; job safely requeued" },
  });
  if (envBoolean("WHISPERX_AUTO_BACKFILL", true)) await enqueueExistingEpisodes();
  schedule(0);
  console.log("WhisperX background worker started");
}

async function getTranscriptionSummary() {
  const rows = await prisma.episode.groupBy({ by: ["transcriptStatus"], _count: { _all: true } });
  return Object.fromEntries(rows.map((row) => [row.transcriptStatus, row._count._all]));
}

module.exports = {
  STATUS,
  enqueueEpisodeTranscription,
  enqueueExistingEpisodes,
  cancelEpisodeTranscription,
  getTranscriptionSummary,
  startTranscriptionWorker,
};
