const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { getRandomImageFromBucket } = require('../server/social/r2');
const { ensureLocalImage, handleStructuredAgentResponse, db } = require('../server/index');

async function testFullFlow() {
  console.log('🛡️  Starting END-TO-END FLOW TEST...');
  
  // 1. MOCK AGENT RESPONSE
  console.log('\n📝 Step 1: Mocking AI Agent response (keyword: "Tinubu")');
  const mockResponse = {
    action: "create_posts",
    posts: [
      {
        platform: "instagram",
        hook: "President Tinubu at the Airport checking developments",
        body: "Big news today on the infrastructure front.",
        cta: "Read more on Paperly",
        visual_content: {
          template_type: "single_post",
          version: 1,
          data: {
            title: "Infrastructure Check: President Tinubu at the Hub",
            subtitle: "Presidential visit to the transport hub to inspect new developments and security measures."
          }
        }
      }
    ]
  };

  // 2. TRIGGER FLOW
  try {
    console.log('🚀 Step 2: Triggering handleStructuredAgentResponse...');
    await handleStructuredAgentResponse(mockResponse);
    console.log('✅ Flow execution triggered successfully.');

    // 3. VERIFY DATABASE & FILES
    console.log('\n🔍 Step 3: Verifying outputs...');
    const post = db.run("SELECT * FROM posts ORDER BY id DESC LIMIT 1")[0];
    
    if (!post) {
      throw new Error('❌ No post found in DB after test.');
    }
    
    console.log(`📌 Post ID: ${post.id}`);
    console.log(`📌 Visual Assets: ${post.visual_assets}`);

    const assets = JSON.parse(post.visual_assets);
    if (assets.length === 0) {
      console.warn('⚠️  Visual assets is empty. This could be due to keyword mismatch or render delay.');
    } else {
      for (const asset of assets) {
        console.log(`🔗 Checking asset: ${asset}`);
        if (asset.startsWith('/local-images/')) {
          const fullPath = path.join(__dirname, '../data', asset.substring(1));
          if (fs.existsSync(fullPath)) {
            console.log(`✅ FILE EXISTS ON DISK: ${fullPath}`);
          } else {
            console.error(`❌ FILE MISSING ON DISK: ${fullPath}`);
          }
        } else {
          console.warn(`⚠️ Unexpected asset URL format: ${asset}`);
        }
      }
    }
    
    console.log('\n🏆 E2E TEST COMPLETE');
  } catch (err) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    process.exit(1);
  }
}

testFullFlow();
