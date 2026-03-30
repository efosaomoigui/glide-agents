const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { uploadToR2 } = require('../server/social/r2');
const fs = require('fs');

async function testR2() {
  console.log('--- CLOUDFLARE R2 VERIFICATION ---\n');

  const {
      CLOUDFLARE_ACCOUNT_ID,
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_BUCKET_NAME
  } = process.env;

  if (!CLOUDFLARE_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
      console.error('❌ R2 Credentials are not configured in .env');
      console.log('Please fill in CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.');
      return;
  }

  console.log('📦 Attempting test upload...');
  const testFilePath = path.resolve(__dirname, '../README.md');
  const testFileName = `test_upload_${Date.now()}.txt`;

  try {
      const url = await uploadToR2(testFilePath, testFileName);
      if (url) {
          console.log('\n✅ SUCCESS!');
          console.log(`🔗 Public URL: ${url}`);
          console.log('\nPlease visit the URL in your browser to confirm visibility.');
      } else {
          console.error('\n❌ Upload failed (returned null). Check server logs.');
      }
  } catch (err) {
      console.error('\n❌ Crash during R2 test:', err.message);
  }
}

testR2();
