const prisma = require("../config/database");
const { enqueueEpisodeTranscription } = require("./transcriptionService");

let running = false;

async function publishDueEpisodes() {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const due = await prisma.episode.findMany({
      where: { publicationStatus: "SCHEDULED", scheduledAt: { lte: now }, isDeleted: false },
      select: { id: true },
      take: 50,
      orderBy: { scheduledAt: "asc" },
    });
    for (const episode of due) {
      const result = await prisma.episode.updateMany({
        where: { id: episode.id, publicationStatus: "SCHEDULED", scheduledAt: { lte: now }, isDeleted: false },
        data: { publicationStatus: "PUBLISHED", scheduledAt: null },
      });
      if (result.count) {
        await enqueueEpisodeTranscription(episode.id).catch((error) => {
          console.error(`Unable to queue transcript for scheduled episode ${episode.id}:`, error);
        });
        console.info(`Scheduled episode ${episode.id} is now published.`);
      }
    }
  } catch (error) {
    console.error("Scheduled episode publishing check failed:", error);
  } finally {
    running = false;
  }
}

function startEpisodeScheduler() {
  publishDueEpisodes();
  const timer = setInterval(publishDueEpisodes, 15_000);
  timer.unref?.();
}

module.exports = { startEpisodeScheduler, publishDueEpisodes };
