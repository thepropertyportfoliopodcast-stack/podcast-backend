const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

// ✅ Explicitly tell fluent-ffmpeg where FFmpeg is
ffmpeg.setFfmpegPath(ffmpegPath);

exports.convertVideoToAudio = (inputUrl, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(inputUrl)
      // ✅ Critical for cloud URLs (Backblaze B2, S3, etc.)
      .inputOptions([
        "-reconnect 1",
        "-reconnect_streamed 1",
        "-reconnect_delay_max 5",
      ])
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("start", (commandLine) => {
        console.log("🎬 FFmpeg command:", commandLine);
      })
      .on("end", () => {
        resolve();
      })
      .on("error", (error) => {
        reject(error);
      })
      .save(outputPath);
  });
};