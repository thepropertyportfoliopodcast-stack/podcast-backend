const cron = require("node-cron");
const prisma = require("./prismaconfig");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { convertVideoToAudio } = require("./utils/audioConverter");
const { uploadFileToSpaces } = require("./utils/FileUploader");
const logger = require("./utils/Logger");

let isCronRunning = false;

module.exports = () => {
  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    if (isCronRunning) {
      // console.log("⏸ Cron already running, skipping...");
      return;
    }

    isCronRunning = true;
    console.log("🎧 Audio conversion cron running...");
    logger.info("🎧 Audio conversion cron running...");

    try {
      // Get one pending episode
      const episode = await prisma.episode.findFirst({
        where: {
          audioStatus: "PENDING",
          link: { not: null },
          isDeleted: false,
        },
        orderBy: { createdAt: "asc" },
      });

      if (!episode) {
        // console.log("✅ No episodes pending");
        return;
      }

      // Lock the episode
      await prisma.episode.update({
        where: { id: episode.id },
        data: { audioStatus: "PROCESSING" },
      });

      logger.info(`🔄 Processing episode: ${episode.uuid}`);
      console.log(`🔄 Processing episode: ${episode.uuid}`);


      // Ensure temp folder exists
      // const tempDir = path.join(os.tmpdir(), "podcast-audio");
      const tempDir = "/var/tmp/podcast-audio";
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      const tempAudioPath = path.join(tempDir, `${episode.uuid}.mp3`);

      // Convert video to mp3
      await convertVideoToAudio(episode.link, tempAudioPath);

      // Convert file → multer-like object
      const fileBuffer = fs.readFileSync(tempAudioPath);

      const multerStyleFile = {
        originalname: `${episode.uuid}.mp3`,
        buffer: fileBuffer,
        mimetype: "audio/mpeg",
      };

      // Upload to Backblaze
      const audioUrl = await uploadFileToSpaces(multerStyleFile);

      if (!audioUrl) {
        console.log("❌ Upload failed - marking FAILED");
        await prisma.episode.update({
          where: { id: episode.id },
          data: { audioStatus: "FAILED" },
        });
        return;
      }

      // Save audio URL
      await prisma.episode.update({
        where: { id: episode.id },
        data: {
          audio: audioUrl,
          audioStatus: "COMPLETED",
        },
      });

      logger.info(`✅ Audio completed: ${episode.uuid}`);
      console.log(`✅ Audio completed: ${episode.uuid}`);

      // Cleanup
      fs.existsSync(tempAudioPath) && fs.unlinkSync(tempAudioPath);

    } catch (error) {
      logger.error("❌ Cron failed:", error);
      console.log("❌ Cron failed:", error);

      await prisma.episode.updateMany({
        where: { audioStatus: "PROCESSING" },
        data: { audioStatus: "FAILED" },
      });

    } finally {
      isCronRunning = false;
    }
  });
};