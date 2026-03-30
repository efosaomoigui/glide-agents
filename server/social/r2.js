const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

/**
 * Cloudflare R2 Uploader
 * Handles uploading local visual assets to Cloudflare R2 for public access.
 */

async function uploadToR2(filePath, fileName) {
  const {
      CLOUDFLARE_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME,
      CDN_BASE_URL
  } = process.env;

  if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      console.warn('⚠️ R2 Credentials not fully configured. Skipping upload.');
      return null;
  }

  const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
  });

  try {
      const fileContent = fs.readFileSync(filePath);
      const isVideo = fileName.toLowerCase().endsWith('.mp4');
      
      const uploadParams = {
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          Body: fileContent,
          ContentType: isVideo ? 'video/mp4' : 'image/png',
      };

      await s3.send(new PutObjectCommand(uploadParams));
      
      const publicUrl = `${CDN_BASE_URL}/${fileName}`;
      console.log(`✅ Uploaded to R2: ${publicUrl}`);
      return publicUrl;
  } catch (err) {
      console.error('❌ R2 Upload Error:', err.message);
      return null;
  }
}

module.exports = { uploadToR2 };
