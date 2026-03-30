const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { postToFacebook } = require('../server/social/facebook');

async function testRealPost() {
  console.log('🚀 Attempting a DIRECT Facebook post test...');
  
  const mockPost = {
    id: 9999, // dummy id
    hook: "Testing GLIDE Agent Connection",
    body: "This is a verification post to ensure Facebook integration is working correctly.",
    cta: "Visit paperly.online",
    hashtags: JSON.stringify(["#AI", "#Marketing", "#Testing"])
  };

  try {
    const result = await postToFacebook(mockPost);
    console.log('\n✅ SUCCESS!');
    console.log('Post ID:', result);
    console.log('Check your Facebook Page now!');
  } catch (err) {
    console.error('\n❌ FAILED!');
    console.log('Error Message:', err.message);
    if (err.response) {
      console.log('API Response:', JSON.stringify(err.response.data, null, 2));
    }
  }
}

testRealPost();
