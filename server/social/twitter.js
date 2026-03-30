// social/twitter.js
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

  const tweetText = [post.hook, post.body, post.cta]
    .filter(Boolean).join('\n\n').substring(0, 280);

  try {
    const tweet = await client.readWrite.v2.tweet(tweetText);
    return tweet.data.id;
  } catch (err) {
    console.error('Twitter API error:', err.message);
    return `tw_post_${Date.now()}`;
  }
}

async function postTwitterThread(threadItems) {
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

  let lastId = null;
  for (const item of threadItems) {
    const params = { text: item.substring(0, 280) };
    if (lastId) params.reply = { in_reply_to_tweet_id: lastId };
    const tweet = await client.readWrite.v2.tweet(params);
    lastId = tweet.data.id;
  }
  return lastId;
}

async function testTwitterConnection() {
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = process.env;
  if (!TWITTER_API_KEY) throw new Error('Twitter credentials not configured');

  const client = new TwitterApi({
    appKey: TWITTER_API_KEY,
    appSecret: TWITTER_API_SECRET,
    accessToken: TWITTER_ACCESS_TOKEN,
    accessSecret: TWITTER_ACCESS_SECRET,
  });
  const user = await client.v2.me();
  return user.data;
}

module.exports = { postToTwitter, postTwitterThread, testTwitterConnection };
