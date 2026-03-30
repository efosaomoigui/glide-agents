const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Blob } = require('buffer');

async function postToFacebook(post) {
  const { FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN, CDN_BASE_URL } = process.env;
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_ACCESS_TOKEN) throw new Error('Facebook credentials not configured');

  const message = `${post.hook}\n\n${post.body}\n\n${post.cta}\n\n${
    post.hashtags ? JSON.parse(post.hashtags).join(' ') : ''
  }`;

  const visualAssets = post.visual_assets ? JSON.parse(post.visual_assets) : [];
  
  try {
    if (visualAssets && visualAssets.length > 0) {
      // If we have images, post to /photos (single) or carousel logic
      if (visualAssets.length === 1) {
        const assetPath = visualAssets[0];
        const fileName = assetPath.split('/').pop();
        
        // Check if file exists in data/output (rendered) or data/ (legacy/raw)
        let fullPath = path.resolve(__dirname, '../../data/output', fileName);
        if (!fs.existsSync(fullPath)) {
          fullPath = path.resolve(__dirname, '../../data', assetPath.replace(/^\//, ''));
        }
        
        if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isFile()) {
          console.log('📤 Uploading binary image to Facebook:', fullPath);
          const form = new FormData();
          form.append('caption', message);
          form.append('access_token', FACEBOOK_ACCESS_TOKEN);
          
          const fileData = fs.readFileSync(fullPath);
          const blob = new Blob([fileData], { type: 'image/png' });
          form.append('source', blob, 'post.png');

          const response = await axios.post(
            `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/photos`,
            form
          );
          return response.data.id;
        } else {
          // Fallback to URL if file not found locally
          const url = assetPath.startsWith('http') ? assetPath : `${CDN_BASE_URL}/${assetPath.split('/').pop()}`;
          const response = await axios.post(
            `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/photos`,
            { url, caption: message, access_token: FACEBOOK_ACCESS_TOKEN }
          );
          return response.data.id;
        }
      } else {
        // Use existing carousel logic
        const urls = visualAssets.map(a => a.startsWith('http') ? a : `${CDN_BASE_URL}/${a.split('/').pop()}`);
        return await postFacebookCarousel(post, urls);
      }
    }

    // Default: Text only post
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/feed`,
      { message, access_token: FACEBOOK_ACCESS_TOKEN }
    );
    return response.data.id;
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error('Facebook API error:', errorMsg);
    throw new Error(errorMsg);
  }
}

// Post carousel (multiple images) to Facebook
async function postFacebookCarousel(post, imageUrls) {
  const { FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN } = process.env;

  // Step 1: Create photo objects
  const photoIds = [];
  for (const url of imageUrls) {
    const r = await axios.post(
      `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/photos`,
      { url, published: false, access_token: FACEBOOK_ACCESS_TOKEN }
    );
    photoIds.push({ media_fbid: r.data.id });
  }

  // Step 2: Create multi-photo post
  try {
    const message = `${post.hook}\n\n${post.body}\n\n${post.cta}`;
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}/feed`,
      {
        message,
        attached_media: photoIds,
        access_token: FACEBOOK_ACCESS_TOKEN
      }
    );
    return response.data.id;
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    console.error('Facebook Carousel error:', errorMsg);
    throw new Error(errorMsg);
  }
}

async function testFacebookConnection() {
  const { FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN } = process.env;
  if (!FACEBOOK_PAGE_ID || !FACEBOOK_ACCESS_TOKEN) throw new Error('Facebook credentials not configured');

  const response = await axios.get(`https://graph.facebook.com/v19.0/${FACEBOOK_PAGE_ID}?fields=name,id&access_token=${FACEBOOK_ACCESS_TOKEN}`);
  return response.data;
}

module.exports = { postToFacebook, postFacebookCarousel, testFacebookConnection };
