const { getpodcastLists } = require("../controllers/rssController");
const { verifyToken } = require("../middleware/authenticate");
const router = require("express").Router();
router.get("/rss/:type/podcasts/:podcastId", getpodcastLists);
module.exports = router;