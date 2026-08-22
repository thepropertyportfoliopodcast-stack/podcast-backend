const mm = require("music-metadata");
const { getVideoDurationInSeconds } = require("get-video-duration");
const fs = require("fs");
const path = require("path");
const os = require("os");

async function getMediaDurationFromBuffer(buffer, filename) {
    const ext = path.extname(filename).toLowerCase();
    const audioExts = [
        ".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg",
        ".wma", ".aiff", ".alac", ".opus", ".amr", ".pcm"
    ];
    const videoExts = [
        ".mp4", ".mov", ".webm", ".avi", ".mkv",
        ".flv", ".wmv", ".mpeg", ".mpg", ".3gp", ".m4v"
    ];
    const tempPath = path.join(os.tmpdir(), `${Date.now()}${ext}`);
    fs.writeFileSync(tempPath, buffer);
    let duration = 0;
    try {
        if (audioExts.includes(ext)) {
            const metadata = await mm.parseFile(tempPath);
            duration = metadata.format.duration;
        } else if (videoExts.includes(ext)) {
            duration = await getVideoDurationInSeconds(tempPath);
        } else {
            throw new Error("Unsupported media type");
        }
    } finally {
        fs.unlinkSync(tempPath);
    }
    return duration;
}

module.exports = { getMediaDurationFromBuffer };
