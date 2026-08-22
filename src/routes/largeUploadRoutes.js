const express = require("express");
const router = express.Router();
const {
  startLargeUpload,
  completeLargeUpload,
  getUploadPartUrl
} = require("../controllers/largeUploadController");
const { verifyToken } = require("../middleware/authenticate");

// Init multipart
router.post("/upload/init", verifyToken, startLargeUpload);

router.post("/upload/part-url", verifyToken, getUploadPartUrl);

// Complete multipart
router.post("/upload/complete", verifyToken, completeLargeUpload);

// **Note:** /upload/part is handled as PUT directly in app.js
// router.uploadLargePart = uploadLargePart; 

module.exports = router;