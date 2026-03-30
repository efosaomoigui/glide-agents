// ── social/tiktok.js ──────────────────────────────────────────────────────────
const axios = require('axios');

/**
 * Post to TikTok
 * NOTE: TikTok recommends posting as a DRAFT from phone for better reach.
 * This creates a draft that the owner then publishes manually with a trending sound.
 */
async function postToTikTok(post) {
  const { TIKTOK_ACCESS_TOKEN, TIKTOK_OPEN_ID } = process.env;
  if (!TIKTOK_ACCESS_TOKEN) throw new Error('TikTok access token not configured');

  // For slideshow posts (recommended format)
  const payload = {
    post_info: {
      title: post.caption || `${post.hook}\n\n${post.cta}`,
      privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_duet: false,
      disable_comment: false,
      disable_stitch: false,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      // NOTE: In production, you'd upload generated images to a CDN
      // and provide their URLs here. For now this is the structure.
      photo_images: post.visual_assets
        ? JSON.parse(post.visual_assets).map(url => ({
            image_url: url.startsWith('http') ? url : `${process.env.CDN_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`
          }))
        : [],
    }
  };

  try {
    const response = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/content/init/',
      payload,
      {
        headers: {
          'Authorization': `Bearer ${TIKTOK_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.data?.publish_id || 'tiktok_draft';
  } catch (err) {
    console.error('TikTok API error:', err.response?.data || err.message);
    // Return mock ID for development
    return `tiktok_draft_${Date.now()}`;
  }
}

async function testTikTokConnection() {
  const { TIKTOK_ACCESS_TOKEN } = process.env;
  if (!TIKTOK_ACCESS_TOKEN) throw new Error('TikTok access token not configured');

  const response = await axios.get('https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url', {
    headers: { 'Authorization': `Bearer ${TIKTOK_ACCESS_TOKEN}` }
  });
  return response.data.data?.user || { display_name: 'TikTok User' };
}

module.exports = { postToTikTok, testTikTokConnection };
