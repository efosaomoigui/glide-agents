// social/instagram.js
const axios = require('axios');

async function waitForMediaReady(containerId, accessToken, maxRetries = 24) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v19.0/${containerId}`,
        { params: { fields: 'status_code', access_token: accessToken } }
      );
      
      const status = response.data.status_code;
      console.log(`Instagram media container ${containerId} status: ${status} (Attempt ${i + 1}/${maxRetries})`);
      
      if (status === 'FINISHED') return true;
      if (status === 'ERROR') throw new Error('Instagram media processing failed');
      if (status === 'EXPIRED') throw new Error('Instagram media container expired');
      
      // Wait 5 seconds before next poll
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      console.error(`Error polling Instagram media status: ${err.message}`);
      if (err.response?.data?.error?.message) {
        console.error('API Error Details:', err.response.data.error.message);
      }
      // If it's a transient error, continue polling
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  throw new Error('Instagram media processing timed out after 2 minutes');
}

async function postToInstagram(post) {
  const { INSTAGRAM_ACCOUNT_ID, FACEBOOK_ACCESS_TOKEN, CDN_BASE_URL } = process.env;
  if (!INSTAGRAM_ACCOUNT_ID || !FACEBOOK_ACCESS_TOKEN)
    throw new Error('Instagram credentials not configured');

  const caption = [post.hook, post.body, post.cta,
    post.hashtags ? JSON.parse(post.hashtags).join(' ') : ''
  ].filter(Boolean).join('\n\n');

  const visualAssets = post.visual_assets ? JSON.parse(post.visual_assets) : [];
  
  try {
    if (visualAssets && visualAssets.length > 0) {
      if (visualAssets.length === 1) {
        const asset = visualAssets[0];
        const url = asset.startsWith('http') ? asset : `${CDN_BASE_URL}/${asset.split('/').pop()}`;
        const isVideo = url.toLowerCase().endsWith('.mp4');

        const media = await axios.post(
          `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
          { 
            [isVideo ? 'video_url' : 'image_url']: url, 
            media_type: isVideo ? 'REELS' : undefined,
            caption, 
            access_token: FACEBOOK_ACCESS_TOKEN 
          }
        );

        const containerId = media.data.id;
        
        // Wait for media to be ready before publishing
        await waitForMediaReady(containerId, FACEBOOK_ACCESS_TOKEN);

        const publish = await axios.post(
          `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
          { creation_id: containerId, access_token: FACEBOOK_ACCESS_TOKEN }
        );
        return publish.data.id;
      } else {
        const urls = visualAssets.map(a => a.startsWith('http') ? a : `${CDN_BASE_URL}/${a.split('/').pop()}`);
        return await postInstagramCarousel(post, urls);
      }
    }

    // Fallback to default image if none provided
    const imageUrl = process.env.DEFAULT_POST_IMAGE || 'https://your-cdn.com/glide-default.jpg';
    const media = await axios.post(
      `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
      { image_url: imageUrl, caption, access_token: FACEBOOK_ACCESS_TOKEN }
    );
    
    await waitForMediaReady(media.data.id, FACEBOOK_ACCESS_TOKEN);

    const publish = await axios.post(
      `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
      { creation_id: media.data.id, access_token: FACEBOOK_ACCESS_TOKEN }
    );
    return publish.data.id;
  } catch (err) {
    console.error('Instagram API error:', err.response?.data || err.message);
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

async function postInstagramCarousel(post, imageUrls) {
  const { INSTAGRAM_ACCOUNT_ID, FACEBOOK_ACCESS_TOKEN } = process.env;
  const caption = [post.hook, post.body, post.cta].filter(Boolean).join('\n\n');

  const childIds = [];
  for (const url of imageUrls) {
    const isVideo = url.toLowerCase().endsWith('.mp4');
    const r = await axios.post(
      `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
      { 
        [isVideo ? 'video_url' : 'image_url']: url, 
        is_carousel_item: true, 
        media_type: isVideo ? 'VIDEO' : undefined,
        access_token: FACEBOOK_ACCESS_TOKEN 
      }
    );
    childIds.push(r.data.id);
  }

  // Wait for all children to be ready
  for (const id of childIds) {
    await waitForMediaReady(id, FACEBOOK_ACCESS_TOKEN);
  }

  const carousel = await axios.post(
    `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
    { media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: FACEBOOK_ACCESS_TOKEN }
  );

  await waitForMediaReady(carousel.data.id, FACEBOOK_ACCESS_TOKEN);

  const publish = await axios.post(
    `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
    { creation_id: carousel.data.id, access_token: FACEBOOK_ACCESS_TOKEN }
  );
  return publish.data.id;
}

async function testInstagramConnection() {
  const { INSTAGRAM_ACCOUNT_ID, FACEBOOK_ACCESS_TOKEN } = process.env;
  if (!INSTAGRAM_ACCOUNT_ID || !FACEBOOK_ACCESS_TOKEN) throw new Error('Instagram credentials not configured');

  const response = await axios.get(`https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}?fields=username,name&access_token=${FACEBOOK_ACCESS_TOKEN}`);
  return response.data;
}

module.exports = { postToInstagram, postInstagramCarousel, testInstagramConnection };
