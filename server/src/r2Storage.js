const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let clientInstance;

function getConfig() {
  if (process.env.PMC_LOCAL_MODE === '1') {
    throw new Error('Cloudflare R2 access is disabled in local development mode.');
  }

  const {
    R2_BUCKET_NAME,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY
  } = process.env;
  if (!R2_BUCKET_NAME || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Cloudflare R2 is not fully configured. Set R2_BUCKET_NAME, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
  }

  return {
    bucket: R2_BUCKET_NAME,
    client: clientInstance || (clientInstance = new S3Client({
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      region: 'auto',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY
      }
    }))
  };
}

function isConfigured() {
  return process.env.PMC_LOCAL_MODE !== '1' && getMissingConfig().length === 0;
}

function getMissingConfig() {
  return [
    'R2_BUCKET_NAME',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY'
  ].filter((key) => !process.env[key]);
}

async function uploadVideo(filePath, contentType = 'video/mp4') {
  return uploadObject(filePath, 'reels', contentType);
}

async function uploadAvatar(filePath, contentType) {
  return uploadObject(filePath, 'avatars', contentType);
}

async function uploadAppRelease(filePath) {
  return uploadObject(filePath, 'app-releases', 'application/vnd.android.package-archive', '.apk');
}

async function uploadObject(filePath, prefix, contentType, extension) {
  const { bucket, client } = getConfig();
  const key = `${prefix}/${randomUUID()}${extension || path.extname(filePath) || '.mp4'}`;
  const { size } = await fs.promises.stat(filePath);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentLength: size,
    ContentType: contentType
  }));

  return key;
}

async function getVideoUrl(key) {
  const { bucket, client } = getConfig();
  const configuredExpiry = Number(process.env.R2_SIGNED_URL_TTL_SECONDS || 43200);
  const expiresIn = Number.isInteger(configuredExpiry) && configuredExpiry > 0 && configuredExpiry <= 604800
    ? configuredExpiry
    : 43200;

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );
}

async function getAvatarUrl(key) {
  return getVideoUrl(key);
}

async function deleteVideo(key) {
  return deleteObject(key);
}

async function deleteAvatar(key) {
  return deleteObject(key);
}

async function deleteObject(key) {
  const { bucket, client } = getConfig();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

module.exports = {
  deleteAvatar,
  deleteVideo,
  getMissingConfig,
  getAvatarUrl,
  getVideoUrl,
  isConfigured,
  uploadAvatar,
  uploadAppRelease,
  uploadVideo
};
