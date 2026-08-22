const { AddPodcast, GetAllPodcasts, PodcastsDetail, GetAllPodcastswithFiles, UpdatePodcast, AddEpisode, GetEpisodeByUUID, GetAllEpisodes, UpdateEpisode, DeleteEpisode, PermanentDeleteEpisode, DisablePodcast, AddGuide, UpdateGuide, GetAllGuides, UploadCheck, DeleteCheck } = require("../controllers/adminController");
const router = require("express").Router();
const { verifyToken } = require("../middleware/authenticate");
const { upload } = require("../services/storageService");
const { listHosts, getHost, createHost, updateHost } = require("../controllers/hostController");
const { listAdminHeroPhones, createHeroPhone, updateHeroPhone, deleteHeroPhone } = require("../controllers/heroPhoneController");
const { getDashboardAnalytics, getPageSpeedTargets, getPageSpeedAudit, getWebsiteHealth } = require("../controllers/analyticsController");

router.get("/admin/analytics", verifyToken, getDashboardAnalytics);
router.get("/admin/analytics/pagespeed/pages", verifyToken, getPageSpeedTargets);
router.get("/admin/analytics/pagespeed", verifyToken, getPageSpeedAudit);
router.get("/admin/analytics/health", verifyToken, getWebsiteHealth);

router.get("/admin/hero-phone/get", verifyToken, listAdminHeroPhones);
router.post("/admin/hero-phone/add", verifyToken, upload.fields([{ name: "thumbnail", maxCount: 1 }, { name: "shortVideo", maxCount: 1 }]), createHeroPhone);
router.post("/admin/hero-phone/update/:id", verifyToken, upload.fields([{ name: "thumbnail", maxCount: 1 }, { name: "shortVideo", maxCount: 1 }]), updateHeroPhone);
router.delete("/admin/hero-phone/delete/:id", verifyToken, deleteHeroPhone);

router.get("/admin/host/get", verifyToken, listHosts);
router.get("/admin/host/get/:id", verifyToken, getHost);
router.post("/admin/host/add", verifyToken, upload.single("image"), createHost);
router.post("/admin/host/update/:id", verifyToken, upload.single("image"), updateHost);

router.post("/admin/podcast/add", verifyToken, upload.single('thumbnail'), AddPodcast);
router.get("/admin/podcast/get", GetAllPodcasts);
router.get("/admin/podcast/get-detail/all", GetAllPodcastswithFiles);
router.get("/admin/podcast/get/:id", PodcastsDetail);
router.post("/admin/podcast/update/:id", verifyToken,  upload.single('thumbnail'), UpdatePodcast);
router.delete("/admin/podcast/delete/:id", verifyToken, DisablePodcast);

router.post("/admin/file/add", verifyToken, upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "homepageThumbnail", maxCount: 1 },
  ]), AddEpisode);
     
router.get("/admin/file/getAll", GetAllEpisodes);
router.get("/admin/file/get/:id", GetEpisodeByUUID);
    
router.post("/admin/file/update/:id", verifyToken, upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "homepageThumbnail", maxCount: 1 },
  ]), UpdateEpisode);

router.delete("/admin/file/delete/:id", verifyToken, DeleteEpisode);
router.delete("/admin/file/delete-permanent/:id", verifyToken, PermanentDeleteEpisode);

router.post("/admin/guide/add", verifyToken, upload.fields([
    { name: 'guide', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    ]), AddGuide);
router.post("/admin/file/update/:id", verifyToken, upload.fields([
    { name: 'guide', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    ]), UpdateGuide);
router.get("/admin/guide/get", GetAllGuides);

router.post("/admin/test/upload", upload.single('thumbnail'), UploadCheck);
router.post("/admin/test/delete", DeleteCheck);

module.exports = router;
