const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { postToInstagram } = require('../server/social/instagram');
const { postToTwitter } = require('../server/social/twitter');

async function testOtherPlatforms() {
  const mockPost = {
    id: 9999,
    hook: "Testing GLIDE Agent Connections",
    body: "Final verification post for multi-platform integration.",
    cta: "Visit paperly.online",
    hashtags: JSON.stringify(["#AI", "#Marketing", "#Paperly"])
  };

  console.log('\n--- INSTAGRAM TEST ---');
  try {
    const igId = await postToInstagram(mockPost);
    console.log('✅ Instagram SUCCESS! Post ID:', igId);
  } catch (err) {
    console.error('❌ Instagram FAILED:', err.message);
  }

  console.log('\n--- X (TWITTER) TEST ---');
  try {
    const twId = await postToTwitter(mockPost);
    console.log('✅ X SUCCESS! Post ID:', twId);
  } catch (err) {
    console.error('❌ X FAILED:', err.message);
  }

  console.log('\n--- TEST COMPLETE ---');
}

testOtherPlatforms();
