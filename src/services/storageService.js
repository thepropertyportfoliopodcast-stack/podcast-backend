const multer = require('multer');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const { encodeMediaUrl, sanitizeMediaFileName } = require('../utils/mediaUrl');

const hasAwsStorage = () => Boolean(
  process.env.AWS_REGION &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET_NAME
);

const hasB2Storage = () => Boolean(
  process.env.B2_REGION &&
  process.env.B2_ENDPOINT &&
  process.env.B2_KEY_ID &&
  process.env.B2_APPLICATION_KEY &&
  process.env.B2_BUCKET &&
  process.env.B2_DOWNLOAD_URL
);

const awsClient = hasAwsStorage() ? new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}) : null;

const b2Client = hasB2Storage() ? new S3Client({
  region: process.env.B2_REGION,
  endpoint: process.env.B2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APPLICATION_KEY,
  },
}) : null;

const upload = multer({ storage: multer.memoryStorage() });

/**
 * Upload file to AWS S3
 * (same function name & behavior)
 */
const uploadFileToSpaces = async (file) => {
  if (!file?.buffer) return null;

  const fileName = `${uuidv4()}-${sanitizeMediaFileName(file.originalname)}`;
  const key = `files/${fileName}`;
  const stores = [];

  if (awsClient) {
    stores.push({
      name: 'AWS S3',
      client: awsClient,
      bucket: process.env.S3_BUCKET_NAME,
      publicUrl: `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    });
  }
  if (b2Client) {
    stores.push({
      name: 'Backblaze B2',
      client: b2Client,
      bucket: process.env.B2_BUCKET,
      publicUrl: `${process.env.B2_DOWNLOAD_URL.replace(/\/+$/, '')}/file/${process.env.B2_BUCKET}/${key}`,
    });
  }

  if (!stores.length) {
    console.error('Upload error: no AWS S3 or Backblaze B2 image storage is configured');
    return null;
  }

  for (const store of stores) {
    try {
      await store.client.send(new PutObjectCommand({
        Bucket: store.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }));
      return encodeMediaUrl(store.publicUrl);
    } catch (err) {
      console.error(`${store.name} upload error:`, err.message);
    }
  }

  return null;
};

/**
 * Delete file from AWS S3
 * (same function name & behavior)
 */
const deleteFileFromSpaces = async (fileUrl) => {
  try {
    const url = new URL(fileUrl);
    const b2Prefix = `/file/${process.env.B2_BUCKET || ''}/`;
    const isB2File = Boolean(b2Client) && url.pathname.startsWith(b2Prefix);
    const client = isB2File ? b2Client : awsClient;
    const bucket = isB2File ? process.env.B2_BUCKET : process.env.S3_BUCKET_NAME;
    const fileKey = isB2File
      ? url.pathname.slice(b2Prefix.length)
      : url.pathname.replace(/^\/+/, '');

    if (!client || !bucket || !fileKey) {
      console.warn('Delete skipped: the matching object storage is not configured');
      return false;
    }

    const deleteParams = {
      Bucket: bucket,
      Key: fileKey,
    };

    const command = new DeleteObjectCommand(deleteParams);
    await client.send(command);

    return true;
  } catch (err) {
    console.error('Delete error:', err.message);
    return false;
  }
};

module.exports = { upload, uploadFileToSpaces, deleteFileFromSpaces };
