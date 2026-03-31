// social/instagram.js
const axios = require('axios');

async function waitForMediaReady(containerIds, accessToken, maxRetries = 20) {
  const ids = Array.isArray(containerIds) ? containerIds : [containerIds];
  const pendingIds = new Set(ids);
  
  console.log(`📡 Monitoring ${pendingIds.size} Instagram media container(s)...`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const idList = Array.from(pendingIds).join(',');
      const response = await axios.get(
        `https://graph.facebook.com/v19.0/`,
        { 
          params: { 
            ids: idList,
            fields: 'status_code,status,error_message', 
            access_token: accessToken 
          } 
        }
      );
      
      const results = response.data;
      for (const id of Object.keys(results)) {
        const item = results[id];
        const status = item.status_code;
        
        if (status === 'FINISHED') {
          console.log(`✅ Container ${id} is FINISHED.`);
          pendingIds.delete(id);
        } else if (status === 'ERROR') {
          console.error(`❌ Container ${id} failed: ${item.error_message || item.status || 'Unknown error'}`);
          throw new Error(`Instagram media processing failed for ${id}: ${item.error_message || 'Unknown error'}`);
        } else if (status === 'EXPIRED') {
          throw new Error(`Instagram media container ${id} expired`);
        } else {
          console.log(`⏳ Container ${id} status: ${status} (Attempt ${i + 1}/${maxRetries})`);
        }
      }

      if (pendingIds.size === 0) return true;
      
      // Wait 12 seconds before next poll to be extra safe with rate limits
      await new Promise(r => setTimeout(r, 12000));
    } catch (err) {
      console.error(`Error polling Instagram media: ${err.message}`);
      if (err.response?.data?.error) {
        const fbError = err.response.data.error;
        console.error(`API Error [${fbError.code}]: ${fbError.message}`);
        // If it's a rate limit error (code 17 or 4), wait longer
        if (fbError.code === 17 || fbError.code === 4) {
          console.warn('⚠️ Rate limit hit. Waiting 30s before retry...');
          await new Promise(r => setTimeout(r, 30000));
        }
      }
      
      // If the error was a processing failure we already threw, re-throw it
      if (err.message.includes('processing failed')) throw err;
      
      await new Promise(r => setTimeout(r, 8000));
    }
  }
  
  if (pendingIds.size > 0) {
    throw new Error(`Timed out waiting for ${pendingIds.size} container(s): ${Array.from(pendingIds).join(', ')}`);
  }
  return true;
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

  // Wait for all children to be ready (using batch polling)
  await waitForMediaReady(childIds, FACEBOOK_ACCESS_TOKEN);

  const carousel = await axios.post(
    `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
    // Fix: Instagram Graph API requires 'children' as a JSON array of strings
    { media_type: 'CAROUSEL', children: childIds, caption, access_token: FACEBOOK_ACCESS_TOKEN }
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
