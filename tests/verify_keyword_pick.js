const { getRandomImageFromBucket, copyObjectBetweenBuckets } = require('../server/social/r2');
require('dotenv').config();

async function test() {
  console.log('🛡️ Testing INTELLIGENT Keyword Match...');
  const hook = "President Tinubu griefs with victims from the airport in Plateau";
  const words = hook.split(/[^a-zA-Z0-9]/).filter(w => w.length > 3);
  const keywords = [...new Set(words)];

  console.log(`🔍 Keywords extracted: ${keywords.join(', ')}`);
  
  const picked = await getRandomImageFromBucket(process.env.R2_BUCKET_NAME2, keywords);
  
  if (picked) {
    console.log(`✅ MATCH FOUND: ${picked.key}`);
    console.log(`🔗 Original URL: ${picked.url}`);
    
    // Test Copy
    const destKey = `test_copy_${Date.now()}_${picked.key}`;
    const unifiedUrl = await copyObjectBetweenBuckets(
      process.env.R2_BUCKET_NAME2, 
      picked.key, 
      process.env.R2_BUCKET_NAME, 
      destKey
    );
    
    if (unifiedUrl) {
      console.log(`✅ COPY SUCCESS: ${unifiedUrl}`);
    } else {
      console.error('❌ COPY FAILED');
    }
  } else {
    console.log('⚠️ No matching images found (Expected if your bucket is empty of these keywords)');
  }
}

test();
