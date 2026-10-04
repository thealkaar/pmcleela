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
  const { B2_BUCKET_NAME, B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY } = process.env;
  const region = process.env.B2_REGION;
  if (!B2_BUCKET_NAME || !B2_ENDPOINT || !region || !B2_KEY_ID || !B2_APPLICATION_KEY) {
    throw new Error('Backblaze B2 is not fully configured. Set B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION, B2_KEY_ID, and B2_APPLICATION_KEY.');
  }

  return {
    bucket: B2_BUCKET_NAME,
    client: clientInstance || (clientInstance = new S3Client({
      endpoint: B2_ENDPOINT,
      region,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: B2_KEY_ID,
        secretAccessKey: B2_APPLICATION_KEY
      }
    }))
  };
}

function isConfigured() {
  return Boolean(
    process.env.B2_BUCKET_NAME &&
    process.env.B2_ENDPOINT &&
    process.env.B2_REGION &&
    process.env.B2_KEY_ID &&
    process.env.B2_APPLICATION_KEY
  );
}

async function uploadVideo(filePath, contentType = 'video/mp4') {
  const { bucket, client } = getConfig();
  const key = `reels/${randomUUID()}${path.extname(filePath) || '.mp4'}`;
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
  const configuredExpiry = Number(process.env.B2_SIGNED_URL_TTL_SECONDS || 43200);
  const expiresIn = Number.isInteger(configuredExpiry) && configuredExpiry > 0 && configuredExpiry <= 604800
    ? configuredExpiry
    : 43200;

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );
}

async function deleteVideo(key) {
  const { bucket, client } = getConfig();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

module.exports = { deleteVideo, getVideoUrl, isConfigured, uploadVideo };
