const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function debugToken() {
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) {
    console.error('❌ No FACEBOOK_ACCESS_TOKEN found in .env');
    return;
  }

  console.log('🔍 Inspecting Facebook Token...\n');

  try {
    // 1. Get Token Info (me)
    const meResponse = await axios.get(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${token}`);
    console.log('✅ Token identity:', meResponse.data.name, `(ID: ${meResponse.data.id})`);

    // 2. Get Permissions
    const permResponse = await axios.get(`https://graph.facebook.com/v19.0/me/permissions?access_token=${token}`);
    console.log('\n📊 Permissions:');
    permResponse.data.data.forEach(p => {
      const status = p.status === 'granted' ? '✅' : '❌';
      console.log(`${status} ${p.permission}`);
    });

    // 3. Check if it matches the Page ID in .env
    const configPageId = process.env.FACEBOOK_PAGE_ID;
    if (meResponse.data.id === configPageId) {
      console.log('\n💎 This is a PAGE ACCESS TOKEN for the correct Page ID.');
    } else {
      console.log(`\n⚠️ Identity mismatch! The token is for ID ${meResponse.data.id}, but your .env says ${configPageId}.`);
      console.log('   (If the token ID is your Personal ID, it is a USER TOKEN and wont work for posting.)');
    }

  } catch (err) {
    console.error('❌ Debug failed:', err.response?.data?.error?.message || err.message);
  }
}

debugToken();
