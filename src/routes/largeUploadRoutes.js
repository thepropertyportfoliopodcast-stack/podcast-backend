const express = require("express");
const router = express.Router();
const {
  startLargeUpload,
  completeLargeUpload,
  getUploadPartUrl
} = require("../controllers/largeUploadController");
const { verifyToken, requirePermission } = require("../middleware/authenticate");
const { ADMIN_PERMISSIONS } = require("../config/adminPermissions");
const podcastAccess = requirePermission(ADMIN_PERMISSIONS.PODCASTS);

// Init multipart
router.post("/upload/init", verifyToken, podcastAccess, startLargeUpload);

router.post("/upload/part-url", verifyToken, podcastAccess, getUploadPartUrl);

// Complete multipart
router.post("/upload/complete", verifyToken, podcastAccess, completeLargeUpload);

// **Note:** /upload/part is handled as PUT directly in app.js
// router.uploadLargePart = uploadLargePart; 

module.exports = router;
