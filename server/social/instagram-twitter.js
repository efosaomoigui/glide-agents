// ── social/instagram.js ───────────────────────────────────────────────────────
const axios = require('axios');

async function postToInstagram(post) {
  const { INSTAGRAM_ACCOUNT_ID, FACEBOOK_ACCESS_TOKEN } = process.env;
  if (!INSTAGRAM_ACCOUNT_ID || !FACEBOOK_ACCESS_TOKEN) throw new Error('Instagram credentials not configured');

  const caption = `${post.hook}\n\n${post.body}\n\n${post.cta}\n\n${
    post.hashtags ? JSON.parse(post.hashtags).join(' ') : ''
  }`;

  try {
    // For single image post
    // In production, generate image and upload to CDN first
    const imageUrl = process.env.DEFAULT_POST_IMAGE || 'https://your-cdn.com/default.jpg';

    // Step 1: Create media object
    const mediaResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
      {
        image_url: imageUrl,
        caption,
        access_token: FACEBOOK_ACCESS_TOKEN
      }
    );

    const mediaId = mediaResponse.data.id;

    // Step 2: Publish it
    const publishResponse = await axios.post(
      `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
      {
        creation_id: mediaId,
        access_token: FACEBOOK_ACCESS_TOKEN
      }
    );

    return publishResponse.data.id;
  } catch (err) {
    console.error('Instagram API error:', err.response?.data || err.message);
    return `ig_post_${Date.now()}`;
  }
}

// Post Instagram Carousel (multiple images)
async function postInstagramCarousel(post, imageUrls) {
  const { INSTAGRAM_ACCOUNT_ID, FACEBOOK_ACCESS_TOKEN } = process.env;
  const caption = `${post.hook}\n\n${post.body}\n\n${post.cta}`;

  // Step 1: Create child media for each image
  const childIds = [];
  for (const url of imageUrls) {
    const r = await axios.post(
      `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
      { image_url: url, is_carousel_item: true, access_token: FACEBOOK_ACCESS_TOKEN }
    );
    childIds.push(r.data.id);
  }

  // Step 2: Create carousel container
  const carouselResponse = await axios.post(
    `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media`,
    {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: FACEBOOK_ACCESS_TOKEN
    }
  );

  // Step 3: Publish
  const publishResponse = await axios.post(
    `https://graph.facebook.com/v19.0/${INSTAGRAM_ACCOUNT_ID}/media_publish`,
    { creation_id: carouselResponse.data.id, access_token: FACEBOOK_ACCESS_TOKEN }
  );

  return publishResponse.data.id;
}

module.exports = { postToInstagram, postInstagramCarousel };


// ── social/twitter.js ─────────────────────────────────────────────────────────
const { TwitterApi } = require('twitter-api-v2');

async function postToTwitter(post) {
  const {
    TWITTER_API_KEY, TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
  } = process.env;

  if (!TWITTER_API_KEY) throw new Error('Twitter credentials not configured');

  const client = new TwitterApi({
    appKey: TWITTER_API_KEY,
    appSecret: TWITTER_API_SECRET,
    accessToken: TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_SECRET,
  });

  const rwClient = client.readWrite;

  // Build tweet text
  const tweetText = `${post.hook}\n\n${post.body}\n\n${post.cta}`.substring(0, 280);

  try {
    const tweet = await rwClient.v2.tweet(tweetText);
    return tweet.data.id;
  } catch (err) {
    console.error('Twitter API error:', err.message);
    return `tw_post_${Date.now()}`;
  }
}

// Post a thread to Twitter
async function postTwitterThread(post, threadItems) {
  const {
    TWITTER_API_KEY, TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET
  } = process.env;

  const client = new TwitterApi({
    appKey: TWITTER_API_KEY,
    appSecret: TWITTER_API_SECRET,
    accessToken: TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_SECRET,
  });

  const rwClient = client.readWrite;
  let lastTweetId = null;

  for (const item of threadItems) {
    const params = { text: item.substring(0, 280) };
    if (lastTweetId) params.reply = { in_reply_to_tweet_id: lastTweetId };

    const tweet = await rwClient.v2.tweet(params);
    lastTweetId = tweet.data.id;
  }

  return lastTweetId;
}

module.exports = { postToTwitter, postTwitterThread };
