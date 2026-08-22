const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4: uuid } = require("uuid");
const crypto = require("crypto");
const { encodeMediaUrl, sanitizeMediaFileName } = require("../utils/mediaUrl");

const s3 = new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY
  },
  forcePathStyle: true
});

exports.startLargeUpload = async (req, res) => {
  try {
    // console.log("Upload route hit");
    const { fileName, mimeType } = req.body;

    const key = `files/${uuid()}-${sanitizeMediaFileName(fileName)}`;

    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.B2_BUCKET,
      Key: key,
      ContentType: mimeType
    });

    const result = await s3.send(command);

    return res.status(200).json({
      uploadId: result.UploadId,
      key
    });

  } catch (err) {
    res.status(500).json({ message: "Init error", error: err.message });
  }
};

exports.getUploadPartUrl = async (req, res) => {
  try {
    const { uploadId, key, partNumber } = req.body;

    const command = new UploadPartCommand({
      Bucket: process.env.B2_BUCKET,
      Key: key,
      UploadId: uploadId,
      PartNumber: Number(partNumber),
    });

    // Generate a URL valid for 15 minutes
    const url = await getSignedUrl(s3, command, { expiresIn: 900 }); 

    res.status(200).json({ url });

  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ message: "Could not generate URL", error: err.message });
  }
};

exports.completeLargeUpload = async (req, res) => {
  try {
    const { uploadId, key, parts } = req.body;

    const command = new CompleteMultipartUploadCommand({
      Bucket: process.env.B2_BUCKET,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts }
    });

    await s3.send(command);

    const fileUrl = encodeMediaUrl(
      `${process.env.B2_DOWNLOAD_URL}/file/${process.env.B2_BUCKET}/${key}`
    );

    res.status(200).json({ fileUrl });

  } catch (err) {
    res.status(500).json({ message: "Merge failed", error: err.message });
  }
};
