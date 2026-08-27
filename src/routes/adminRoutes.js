const { AddPodcast, GetAllPodcasts, PodcastsDetail, GetAllPodcastswithFiles, UpdatePodcast, AddEpisode, GetEpisodeByUUID, GetAllEpisodes, UpdateEpisode, DeleteEpisode, PermanentDeleteEpisode, DisablePodcast, AddGuide, UpdateGuide, GetAllGuides, UploadCheck, DeleteCheck } = require("../controllers/adminController");
const router = require("express").Router();
const { verifyToken, requirePermission, requireSuperAdmin } = require("../middleware/authenticate");
const { ADMIN_PERMISSIONS } = require("../config/adminPermissions");
const { upload } = require("../services/storageService");
const { listHosts, getHost, createHost, updateHost } = require("../controllers/hostController");
const { listAdminHeroPhones, createHeroPhone, updateHeroPhone, deleteHeroPhone } = require("../controllers/heroPhoneController");
const { getDashboardAnalytics, deleteAnalyticsError, clearAnalyticsErrors, getLighthouseTargets, getLighthouseAudit, getWebsiteHealth } = require("../controllers/analyticsController");
const { listAdmins, createAdmin, updateAdmin, deleteAdmin } = require("../controllers/adminUserController");
const { listEpisodeTranscripts, regenerateEpisodeTranscript, cancelEpisodeTranscript, deleteEpisodeTranscript, retryFailedEpisodeTranscripts, backfillEpisodeTranscripts, getEpisodeTranscriptionSummary } = require("../controllers/transcriptionController");

const access = (permission) => [verifyToken, requirePermission(permission)];

router.get("/admin/users", verifyToken, requireSuperAdmin, listAdmins);
router.post("/admin/users", verifyToken, requireSuperAdmin, createAdmin);
router.patch("/admin/users/:id", verifyToken, requireSuperAdmin, updateAdmin);
router.delete("/admin/users/:id", verifyToken, requireSuperAdmin, deleteAdmin);

router.get("/admin/analytics", ...access(ADMIN_PERMISSIONS.ANALYTICS), getDashboardAnalytics);
router.delete("/admin/analytics/errors", ...access(ADMIN_PERMISSIONS.ANALYTICS), clearAnalyticsErrors);
router.delete("/admin/analytics/errors/:id", ...access(ADMIN_PERMISSIONS.ANALYTICS), deleteAnalyticsError);
router.get("/admin/analytics/lighthouse/pages", ...access(ADMIN_PERMISSIONS.ANALYTICS), getLighthouseTargets);
router.get("/admin/analytics/lighthouse", ...access(ADMIN_PERMISSIONS.ANALYTICS), getLighthouseAudit);
router.get("/admin/analytics/health", ...access(ADMIN_PERMISSIONS.ANALYTICS), getWebsiteHealth);

router.get("/admin/hero-phone/get", ...access(ADMIN_PERMISSIONS.PODCASTS), listAdminHeroPhones);
router.post("/admin/hero-phone/add", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.fields([{ name: "thumbnail", maxCount: 1 }, { name: "shortVideo", maxCount: 1 }]), createHeroPhone);
router.post("/admin/hero-phone/update/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.fields([{ name: "thumbnail", maxCount: 1 }, { name: "shortVideo", maxCount: 1 }]), updateHeroPhone);
router.delete("/admin/hero-phone/delete/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), deleteHeroPhone);

router.get("/admin/host/get", ...access(ADMIN_PERMISSIONS.HOSTS), listHosts);
router.get("/admin/host/get/:id", ...access(ADMIN_PERMISSIONS.HOSTS), getHost);
router.post("/admin/host/add", ...access(ADMIN_PERMISSIONS.HOSTS), upload.single("image"), createHost);
router.post("/admin/host/update/:id", ...access(ADMIN_PERMISSIONS.HOSTS), upload.single("image"), updateHost);

router.post("/admin/podcast/add", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.single('thumbnail'), AddPodcast);
router.get("/admin/podcast/get", ...access(ADMIN_PERMISSIONS.PODCASTS), GetAllPodcasts);
router.get("/admin/podcast/get-detail/all", ...access(ADMIN_PERMISSIONS.PODCASTS), GetAllPodcastswithFiles);
router.get("/admin/podcast/get/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), PodcastsDetail);
router.post("/admin/podcast/update/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.single('thumbnail'), UpdatePodcast);
router.delete("/admin/podcast/delete/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), DisablePodcast);

router.post("/admin/file/add", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.any(), AddEpisode);
     
router.get("/admin/file/getAll", ...access(ADMIN_PERMISSIONS.PODCASTS), GetAllEpisodes);
router.get("/admin/file/get/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), GetEpisodeByUUID);
    
router.post("/admin/file/update/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.any(), UpdateEpisode);
router.get("/admin/transcripts", ...access(ADMIN_PERMISSIONS.TRANSCRIPTS), listEpisodeTranscripts);
router.get("/admin/transcripts/status", ...access(ADMIN_PERMISSIONS.TRANSCRIPTS), getEpisodeTranscriptionSummary);
router.post("/admin/transcripts/backfill", ...access(ADMIN_PERMISSIONS.TRANSCRIPTS), backfillEpisodeTranscripts);
router.post("/admin/transcripts/retry-failed", ...access(ADMIN_PERMISSIONS.TRANSCRIPTS), retryFailedEpisodeTranscripts);
router.post("/admin/transcripts/:id/regenerate", ...access(ADMIN_PERMISSIONS.TRANSCRIPTS), regenerateEpisodeTranscript);
router.post("/admin/transcripts/:id/cancel", ...access(ADMIN_PERMISSIONS.TRANSCRIPTS), cancelEpisodeTranscript);
router.delete("/admin/transcripts/:id", ...access(ADMIN_PERMISSIONS.TRANSCRIPTS), deleteEpisodeTranscript);

// Keep the episode-editor action available to admins who can edit podcasts.
router.post("/admin/file/:id/transcript/regenerate", ...access(ADMIN_PERMISSIONS.PODCASTS), regenerateEpisodeTranscript);

router.delete("/admin/file/delete/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), DeleteEpisode);
router.delete("/admin/file/delete-permanent/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), PermanentDeleteEpisode);

router.post("/admin/guide/add", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.fields([
    { name: 'guide', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    ]), AddGuide);
router.post("/admin/file/update/:id", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.fields([
    { name: 'guide', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    ]), UpdateGuide);
router.get("/admin/guide/get", ...access(ADMIN_PERMISSIONS.PODCASTS), GetAllGuides);

router.post("/admin/test/upload", ...access(ADMIN_PERMISSIONS.PODCASTS), upload.single('thumbnail'), UploadCheck);
router.post("/admin/test/delete", ...access(ADMIN_PERMISSIONS.PODCASTS), DeleteCheck);

module.exports = router;
