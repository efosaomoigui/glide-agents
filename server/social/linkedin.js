// social/linkedin.js
const axios = require('axios');

/**
 * Post to LinkedIn (UGC Post API)
 * @param {Object} post - The post object { hook, body, cta, visual_assets }
 * @returns {Promise<string>} - The LinkedIn post ID
 */
async function postToLinkedIn(post) {
  const {
    LINKEDIN_ACCESS_TOKEN,
    LINKEDIN_PERSON_ID // urn:li:person:XXXX
  } = process.env;

  if (!LINKEDIN_ACCESS_TOKEN || !LINKEDIN_PERSON_ID) {
    console.warn('⚠️ LinkedIn credentials not fully configured. Simulating post...');
    return `li_sim_${Date.now()}`;
  }

  const text = [post.hook, post.body, post.cta].filter(Boolean).join('\n\n');

  try {
    const response = await axios.post(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        author: LINKEDIN_PERSON_ID,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: 'NONE' // Default to text. Update if images are supported.
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.id;
  } catch (err) {
    console.error('❌ LinkedIn API Error:', err.response?.data || err.message);
    throw err;
  }
}

async function testLinkedInConnection() {
  const { LINKEDIN_ACCESS_TOKEN } = process.env;
  if (!LINKEDIN_ACCESS_TOKEN) throw new Error('LinkedIn access token missing');

  try {
    const response = await axios.get('https://api.linkedin.com/v2/me', {
      headers: { 'Authorization': `Bearer ${LINKEDIN_ACCESS_TOKEN}` }
    });
    return response.data;
  } catch (err) {
    console.error('❌ LinkedIn Test Failed:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { postToLinkedIn, testLinkedInConnection };
