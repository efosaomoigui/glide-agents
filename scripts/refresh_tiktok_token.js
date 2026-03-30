const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const axios = require('axios');
const fs = require('fs');

async function refreshTikTokToken() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;

  if (!clientKey || !clientSecret || !refreshToken || refreshToken === 'your_refresh_token_here') {
    console.error('❌ Error: Missing required TikTok credentials in .env');
    console.log('Ensure TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, and TIKTOK_REFRESH_TOKEN are set.');
    console.log('\nIf you do not have a refresh token, you must re-authenticate to get one.');
    return;
  }

  console.log('🔄 Refreshing TikTok access token...');

  try {
    // TikTok OAuth 2.0 refresh token endpoint
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const data = response.data;

    if (data.error) {
      throw new Error(`${data.error}: ${data.error_description}`);
    }

    const { access_token, refresh_token, open_id, expires_in, refresh_expires_in } = data;

    console.log('\n✅ Success! New tokens generated.');
    console.log('---------------------------------------------------');
    console.log(`Access Token:  ${access_token}`);
    console.log(`Refresh Token: ${refresh_token}`);
    console.log(`Open ID:       ${open_id}`);
    console.log('---------------------------------------------------');
    console.log(`\nAccess token expires in: ${expires_in} seconds`);
    console.log(`Refresh token expires in: ${refresh_expires_in} seconds`);

    console.log('\nNext steps:');
    console.log('1. Copy the new tokens above.');
    console.log('2. Update TIKTOK_ACCESS_TOKEN and TIKTOK_REFRESH_TOKEN in your .env file.');
    console.log('3. Restart your server.');

  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ Failed to refresh TikTok token:', detail);
    if (err.response?.status === 400) {
      console.log('\n💡 Tip: This often means your refresh token has also expired or is invalid. You may need to login again.');
    }
  }
}

refreshTikTokToken();
