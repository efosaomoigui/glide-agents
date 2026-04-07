const { getRandomImageFromBucket } = require('../server/social/r2');
require('dotenv').config();

async function test() {
  console.log('🛡️ Testing STRICT R2 Picking...');
  console.log(`🪣 Bucket: ${process.env.R2_BUCKET_NAME2 || 'MISSING'}`);

  if (!process.env.R2_BUCKET_NAME2) {
    console.error('❌ R2_BUCKET_NAME2 not set in .env');
    return;
  }

  const url = await getRandomImageFromBucket(process.env.R2_BUCKET_NAME2);
  
  if (url) {
    console.log('✅ SUCCESS: Correctly picked an image from R2.');
    console.log(`🔗 URL: ${url}`);
  } else {
    console.error('❌ FAIL: Empty bucket or R2 selection failed.');
  }
}

test();
