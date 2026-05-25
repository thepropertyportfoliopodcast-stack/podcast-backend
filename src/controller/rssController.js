const { errorResponse } = require("../utils/ErrorHandling");
const catchAsync = require("../utils/catchAsync");
const prisma = require("../prismaconfig");
const { create } = require("xmlbuilder2");

const htmlToPlainText = (value) => {
  if (!value) return "";
  return value
    .toString()
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(ul|ol)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const isAudioMime = (mime) => !!mime && /^audio\//i.test(mime);
const isVideoMime = (mime) => !!mime && /^video\//i.test(mime);

const getExt = (url = "") => {
  const clean = url.split("?")[0].split("#")[0];
  const match = clean.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
};

const isAudioUrl = (url) => {
  const ext = getExt(url);
  return ["mp3", "m4a", "aac", "wav", "ogg", "oga", "flac", "opus"].includes(ext);
};

const isVideoUrl = (url) => {
  const ext = getExt(url);
  return ["mp4", "m4v", "mov", "webm", "mkv"].includes(ext);
};

const isSupportedImageUrl = (url) => {
  const ext = getExt(url);
  return ["jpg", "jpeg", "png"].includes(ext);
};

const detectMime = (url, fallback) => {
  if (fallback) return fallback;
  const ext = getExt(url);
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a" || ext === "aac") return "audio/mp4";
  if (ext === "ogg" || ext === "oga") return "audio/ogg";
  if (ext === "opus") return "audio/opus";
  if (ext === "wav") return "audio/wav";
  if (ext === "flac") return "audio/flac";
  if (ext === "mp4" || ext === "m4v" || ext === "mov") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mkv") return "video/x-matroska";
  return "application/octet-stream";
};
exports.getpodcastLists = catchAsync(async (req, res) => {
  const podcastId = req.params.podcastId;
  const type = req.params.type || "video"; // 'video' | 'audio'
  const podcast = await prisma.podcast.findUnique({
    where: { uuid: podcastId },
  });
  if (!podcast) {
    return errorResponse(res, "Podcast not found", 404);
  }
  const episodes = await prisma.episode.findMany({
    where: { podcastId: podcast?.id, isDeleted: false },
    include: { podcast: true },
    orderBy: { createdAt: "desc" }
  });
  const filteredEpisodes = (episodes || []).filter((ep) => {
    const audioUrl = ep?.audio;
    const videoUrl = ep?.link;
    const guessedIsAudio = (isAudioMime(ep.mimefield) || isAudioUrl(audioUrl)) && !!audioUrl;
    const guessedIsVideo = (isVideoMime(ep.mimefield) || isVideoUrl(videoUrl)) && !!videoUrl;
    if (type === "audio") return guessedIsAudio;
    return guessedIsVideo;
  });
  const feed = create({ version: "1.0", encoding: "UTF-8" })
    .ele("rss", {
      version: "2.0",
      "xmlns:itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
      "xmlns:googleplay": "http://www.google.com/schemas/play-podcasts/1.0",
      "xmlns:content": "http://purl.org/rss/1.0/modules/content/"
    })
    .ele("channel");

  // Channel metadata
  feed.ele("title").txt(podcast.name).up();
  feed.ele("link").txt(`https://thepropertyportfolio.com.au/episode/${podcast?.uuid}`).up();
  feed.ele("description").txt(podcast.description || podcast.name).up();
  feed.ele("language").txt("en-au").up();
  feed.ele("itunes:author").txt(podcast.author || "The Property Portfolio Podcast").up();
  feed.ele("itunes:summary").txt(podcast.description || podcast.name).up();
  feed.ele("itunes:subtitle").txt(podcast.name).up();
  feed.ele("itunes:explicit").txt("no").up();
  
  feed.ele("itunes:owner")
    .ele("itunes:name").txt(podcast.author || "The Property Portfolio Podcast").up()
    .ele("itunes:email").txt(podcast.email || "thepropertyportfoliopodcast@gmail.com").up()
  .up();
  
  feed.ele("itunes:category", { text: "Business" })
    .ele("itunes:category", { text: "Investing" }).up()
  .up();
  if (podcast?.thumbnail && isSupportedImageUrl(podcast.thumbnail)) {
    feed.ele("itunes:image").att("href", podcast.thumbnail).up();
  }

  // Generate episodes based on type
  filteredEpisodes.forEach((ep, index) => {
    const enclosureUrl = type === "audio" ? ep.audio : ep.link;
    if (!enclosureUrl) return;

    const mimeType = detectMime(enclosureUrl, ep.mimefield);
    const fileSize = ep.size ? (ep.size * 1048576).toString() : null;

    const item = feed.ele("item");

    const itemShortDescription = ep.description || htmlToPlainText(ep.detail || "");
    const itemLongTextDescription = htmlToPlainText(ep.detail || "") || ep.description || "";
    const itemHtmlDescription = ep.detail || (ep.description ? `<p>${ep.description}</p>` : "");

    item.ele("title").txt(ep.title).up();
    item.ele("description").txt(itemLongTextDescription).up();
    item.ele("itunes:summary").txt(itemLongTextDescription).up();
    item.ele("itunes:subtitle").txt(itemShortDescription).up();
    item.ele("googleplay:description").txt(itemLongTextDescription).up();
    if (itemHtmlDescription) {
      item.ele("content:encoded").dat(itemHtmlDescription).up();
    }
    item.ele("link").txt(`https://thepropertyportfolio.com.au/podcast/${ep.uuid}`).up();
    item.ele("guid", { isPermaLink: "false" })
      .txt(`https://thepropertyportfolio.com.au/podcast/${ep.uuid}`).up();
    item.ele("pubDate").txt(new Date(ep.createdAt).toUTCString()).up();
    item.ele("itunes:duration").txt(ep.durationInSec?.toString() || "60").up();
    item.ele("itunes:explicit").txt("no").up();
    item.ele("itunes:season").txt(ep.season || 1).up();
    item.ele("itunes:episode").txt(ep.episodeNumber || index + 1).up();
    item.ele("itunes:episodeType").txt("full").up();

    if (ep.thumbnail && isSupportedImageUrl(ep.thumbnail)) {
      item.ele("itunes:image").att("href", ep.thumbnail).up();
    }

    // Dynamic enclosure
    const enclosure = item.ele("enclosure").att("url", enclosureUrl).att("type", mimeType);
    if (fileSize) enclosure.att("length", fileSize);
    enclosure.up();
  });

  const xml = feed.end({ prettyPrint: true });
  res.set("Content-Type", "application/rss+xml");
  res.send(xml);
});


// exports.getpodcastLists = catchAsync(async (req, res) => {
//    const podcast = await prisma.podcast.findUnique({
//       where: { uuid: req.params.uuid },
//       include: { files: true }
//    });

//    if (!podcast) {
//       return errorResponse(res, "Podcast not found", 404);
//    }

//    const feed = create({ version: '1.0', encoding: 'UTF-8' })
//       .ele('rss', {
//          version: '2.0',
//          'xmlns:itunes': 'http://www.itunes.com/dtds/podcast-1.0.dtd',
//          'xmlns:googleplay': 'http://www.google.com/schemas/play-podcasts/1.0'
//       })
//       .ele('channel')
//          .ele('title').txt(podcast.name).up()
//          .ele('link').txt(`https://yourdomain.com/podcast/${podcast.uuid}`).up()
//          .ele('description').txt(podcast.description || '').up()
//          .ele('language').txt(podcast.language || 'en').up()
//          .ele('itunes:author').txt(podcast?.author || podcast?.Author || process.env.APP_NAME || "PODCAST").up()
//          .ele('itunes:summary').txt(podcast.description || '').up()
//          .ele('itunes:explicit').txt(podcast.explicit ? 'yes' : 'no').up()
//          .ele('itunes:owner')
//             .ele('itunes:name').txt(podcast.author || 'Owner').up()
//             .ele('itunes:email').txt(podcast.email || 'owner@example.com').up()
//          .up()
//          .ele('itunes:image').att('href', podcast.thumbnail || 'https://yourdomain.com/default-thumbnail.png').up();

//    // Loop through episodes
//    podcast.files.forEach(ep => {
//       const item = feed.ele('item');
//       item.ele('title').txt(ep.title || '').up();
//       item.ele('description').txt(ep.description || '').up();
//       item.ele('guid').txt(ep.uuid || ep.createdAt).up();
//       item.ele('pubDate').txt(new Date(ep.createdAt).toUTCString()).up();
//       item.ele('itunes:duration').txt(ep.durationInSeconds?.toString() || ep.duration*60 || '60' ).up();
//       item.ele('itunes:explicit').txt('no').up();
//       if (ep.thumbnail) {
//          item.ele('itunes:image').att('href', ep.thumbnail).up();
//       }
//       const sizeinBytes = ep.size * 1048576;
//       item.ele('enclosure', {
//          url: ep.link,
//          type: ep.mime || 'audio/mpeg', // Use audio/mp4 or video/mp4 if video
//          length: sizeinBytes?.toString() || '' // Optional but recommended
//       }).up();
//    });

//    const xml = feed.end({ prettyPrint: true });

//    res.set('Content-Type', 'application/rss+xml');
//    res.send(xml);
// });
