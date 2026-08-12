const { GetAllPodcasts, PodcastsDetail, UploadCheck, GetAllPodcastswithFiles, GetAllFiles, GetFileByUUID, HomeEpisodesGet, GetAllGuides, HomeGuideGet } = require("../controller/fileController");
const router = require("express").Router();
const { upload } = require("../utils/FileUploader");
const { listHosts, getHost } = require("../controller/hostController");

router.get("/host/get", listHosts);
router.get("/host/get/:id", getHost);

router.get("/podcast/get", GetAllPodcasts);
router.get("/podcast/get-detail/all", GetAllPodcastswithFiles);
router.get("/podcast/get/:id", PodcastsDetail);

router.get("/home/file/getAll", HomeEpisodesGet);
router.get("/file/getAll", GetAllFiles);
router.get("/file/get/:id", GetFileByUUID);

router.get("/home/guide/getAll", HomeGuideGet);
router.get("/guide/getAll", GetAllGuides);

// Test Route for upload checking
router.post("/test/upload", upload.single('file'), UploadCheck);

module.exports = router;
