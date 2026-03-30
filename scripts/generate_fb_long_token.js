const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const axios = require('axios');

async function getLongLivedToken() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const shortToken = process.env.FACEBOOK_ACCESS_TOKEN;

  if (!appId || !appSecret || !shortToken) {
    console.error('❌ Error: Missing required environment variables in .env');
    console.log('Ensure FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_ACCESS_TOKEN are set.');
    return;
  }

  console.log('🔄 Exchanging short-lived token for a long-lived one...');

  try {
    const response = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken
      }
    });

    const longLivedToken = response.data.access_token;
    
    console.log('\n✅ Success! Long-lived token generated.');
    console.log('---------------------------------------------------');
    console.log(longLivedToken);
    console.log('---------------------------------------------------');
    console.log('\nNext steps:');
    console.log('1. Copy the token above.');
    console.log('2. Update FACEBOOK_ACCESS_TOKEN in your .env file with this new value.');
    console.log('3. Restart your server.');
    
  } catch (err) {
    console.error('❌ Failed to exchange token:', err.response?.data || err.message);
  }
}

getLongLivedToken();
