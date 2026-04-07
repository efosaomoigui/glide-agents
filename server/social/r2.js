const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

/**
 * Cloudflare R2 Uploader & Sourcing
 * Handles uploading local assets and fetching source images from R2.
 */

const s3Config = () => {
  const {
    CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY
  } = process.env;

  if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    }
  });
};

async function uploadToR2(filePath, fileName) {
  const s3 = s3Config();
  const bucket = process.env.R2_BUCKET_NAME;
  const cdn = process.env.CDN_POST_URL || process.env.CDN_BASE_URL;

  if (!s3 || !bucket) {
      console.warn('⚠️ R2 Credentials not fully configured. Skipping upload.');
      return null;
  }

  try {
      const fileContent = fs.readFileSync(filePath);
      const isVideo = fileName.toLowerCase().endsWith('.mp4');
      
      const uploadParams = {
          Bucket: bucket,
          Key: fileName,
          Body: fileContent,
          ContentType: isVideo ? 'video/mp4' : 'image/png',
      };

      await s3.send(new PutObjectCommand(uploadParams));
      
      const publicUrl = `${cdn}/${fileName}`;
      console.log(`✅ Uploaded to R2 (Post): ${publicUrl}`);
      return publicUrl;
  } catch (err) {
      console.error('❌ R2 Upload Error:', err.message);
      return null;
  }
}

/**
 * Sources a random image from the 'glidebucket' matching the keyword.
 */
async function getRandomImageFromBucket(keyword = null) {
  const s3 = s3Config();
  const bucket = process.env.R2_BUCKET_NAME2 || 'glidebucket';
  const cdn = process.env.CDN_SOURCE_URL || process.env.CDN_BASE_URL;

  if (!s3) return null;

  try {
    const listParams = { Bucket: bucket, MaxKeys: 1000 };
    const data = await s3.send(new ListObjectsV2Command(listParams));
    
    if (!data.Contents || data.Contents.length === 0) {
      console.warn(`⚠️ ${bucket} is empty or inaccessible.`);
      return null;
    }

    const files = data.Contents.map(c => c.Key).filter(k => k.match(/\.(jpg|jpeg|png|webp)$/i));
    if (files.length === 0) return null;

    let selectedFile = null;

    if (keyword) {
      const searchTerms = keyword.toLowerCase().split(/[^\w\d]+/).filter(t => t.length > 2);
      let bestScore = 0;
      let matches = [];

      for (const file of files) {
        const fileNameLower = file.toLowerCase();
        let score = 0;
        for (const term of searchTerms) {
          if (fileNameLower.includes(term)) score++;
        }
        
        if (score > 0) {
          if (score > bestScore) {
            bestScore = score;
            matches = [file];
          } else if (score === bestScore) {
            matches.push(file);
          }
        }
      }

      if (matches.length > 0) {
        selectedFile = matches[Math.floor(Math.random() * matches.length)];
        console.log(`🎯 R2 Keyword Match (${bestScore} points): ${selectedFile} for "${keyword}"`);
      }
    }

    // If no keyword match, user said "just leave blank" — we return null
    if (!selectedFile) {
      console.log(`ℹ️ No matching image for "${keyword}" in ${bucket}.`);
      return null;
    }

    const publicUrl = `${cdn}/${selectedFile}`;
    return publicUrl;
  } catch (err) {
    console.error('❌ R2 Fetch Error:', err.message);
    return null;
  }
}

module.exports = { uploadToR2, getRandomImageFromBucket };

