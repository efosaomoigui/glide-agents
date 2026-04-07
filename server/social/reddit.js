// social/reddit.js
const axios = require('axios');
const snoowrap = require('snoowrap');

/**
 * Post to Reddit (Submission)
 * @param {Object} post - The post object { hook, body, cta, platform }
 * @returns {Promise<string>} - The Reddit submission ID
 */
async function postToReddit(post) {
  const {
    REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET,
    REDDIT_USERNAME,
    REDDIT_PASSWORD,
    REDDIT_USER_AGENT
  } = process.env;

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD) {
    console.warn('⚠️ Reddit credentials not fully configured. Using simulation mode...');
    return `rd_sim_${Date.now()}`;
  }

  try {
    const reddit = new snoowrap({
      userAgent: REDDIT_USER_AGENT || 'Glide Agent / Growth Personal Bot',
      clientId: REDDIT_CLIENT_ID,
      clientSecret: REDDIT_CLIENT_SECRET,
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD
    });

    const subreddit = 'startups'; // Default or dynamically set if post has a subreddit field
    const title = post.hook.substring(0, 300);
    const text = [post.body, post.cta].filter(Boolean).join('\n\n');

    const submission = await reddit.getSubreddit(subreddit).submitSelfpost({
      title: title,
      text: text
    });

    return submission.name; // ID like t3_XXXXXX
  } catch (err) {
    console.error('❌ Reddit API Error:', err.message);
    throw err;
  }
}

async function testRedditConnection() {
  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD } = process.env;
  if (!REDDIT_CLIENT_ID) throw new Error('Reddit client ID missing');

  try {
    const reddit = new snoowrap({
      userAgent: process.env.REDDIT_USER_AGENT || 'Glide Agent Test',
      clientId: REDDIT_CLIENT_ID,
      clientSecret: REDDIT_CLIENT_SECRET,
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD
    });
    const me = await reddit.getMe();
    return me.name;
  } catch (err) {
    console.error('❌ Reddit Test Failed:', err.message);
    throw err;
  }
}

module.exports = { postToReddit, testRedditConnection };
