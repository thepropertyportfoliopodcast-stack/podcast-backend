const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

/**
 * ✅ AWS S3 Client
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Upload file to AWS S3
 * (same function name & behavior)
 */
const uploadFileToSpaces = async (file) => {
  try {
    const fileName = `${uuidv4()}-${file.originalname.replaceAll(' ', '_')}`;
    const folder = 'files';

    const uploadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${folder}/${fileName}`,
      Body: file.buffer,
      ContentType: file.mimetype,
      // ACL: 'public-read', // 👈 required for public URL
    };

    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);

    // ✅ AWS public object URL
    const fileUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${fileName}`;

    return fileUrl;
  } catch (err) {
    console.error('Upload error:', err.message);
    return null;
  }
};

/**
 * Delete file from AWS S3
 * (same function name & behavior)
 */
const deleteFileFromSpaces = async (fileUrl) => {
  try {
    // Extract key from AWS S3 public URL
    // Example:
    // https://bucket-name.s3.region.amazonaws.com/files/uuid-file.ext
    const url = new URL(fileUrl);
    const fileKey = url.pathname.replace(/^\/+/, ''); // files/uuid-file.ext

    const deleteParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: fileKey,
    };

    const command = new DeleteObjectCommand(deleteParams);
    await s3Client.send(command);

    return true;
  } catch (err) {
    console.error('Delete error:', err.message);
    return false;
  }
};

module.exports = { upload, uploadFileToSpaces, deleteFileFromSpaces };