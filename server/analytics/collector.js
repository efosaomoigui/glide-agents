// ── analytics/collector.js ────────────────────────────────────────────────────
/**
 * Collects analytics from all social media platforms
 * and feeds them back into the GLIDE Loop.
 */
const axios = require('axios');

async function collectAllAnalytics(platform, platformPostId) {
  try {
    switch (platform) {
      case 'tiktok':    return await getTikTokMetrics(platformPostId);
      case 'facebook':  return await getFacebookMetrics(platformPostId);
      case 'instagram': return await getInstagramMetrics(platformPostId);
      case 'twitter':   return await getTwitterMetrics(platformPostId);
      default:          return getEmptyMetrics();
    }
  } catch (err) {
    console.error(`Analytics error for ${platform}:`, err.message);
    return getEmptyMetrics();
  }
}

function getEmptyMetrics() {
  return { views: 0, likes: 0, comments: 0, shares: 0, clicks: 0, impressions: 0 };
}

async function getTikTokMetrics(videoId) {
  const { TIKTOK_ACCESS_TOKEN } = process.env;
  if (!TIKTOK_ACCESS_TOKEN || videoId.startsWith('tiktok_draft')) return getEmptyMetrics();

  const response = await axios.post(
    'https://open.tiktokapis.com/v2/video/query/',
    {
      filters: { video_ids: [videoId] },
      fields: ['view_count', 'like_count', 'comment_count', 'share_count']
    },
    { headers: { 'Authorization': `Bearer ${TIKTOK_ACCESS_TOKEN}` } }
  );

  const video = response.data.data?.videos?.[0] || {};
  return {
    views: video.view_count || 0,
    likes: video.like_count || 0,
    comments: video.comment_count || 0,
    shares: video.share_count || 0,
    clicks: 0, // TikTok doesn't expose link clicks via API
    impressions: video.view_count || 0
  };
}

async function getFacebookMetrics(postId) {
  const { FACEBOOK_ACCESS_TOKEN } = process.env;
  if (!FACEBOOK_ACCESS_TOKEN || postId.startsWith('fb_post_')) return getEmptyMetrics();

  const response = await axios.get(
    `https://graph.facebook.com/v19.0/${postId}/insights`,
    {
      params: {
        metric: 'post_impressions,post_engaged_users,post_clicks',
        access_token: FACEBOOK_ACCESS_TOKEN
      }
    }
  );

  const insightsMap = {};
  (response.data.data || []).forEach(m => { insightsMap[m.name] = m.values?.[0]?.value || 0; });

  // Get likes/comments from the post itself
  const postData = await axios.get(
    `https://graph.facebook.com/v19.0/${postId}`,
    {
      params: {
        fields: 'likes.summary(true),comments.summary(true)',
        access_token: FACEBOOK_ACCESS_TOKEN
      }
    }
  );

  return {
    views: insightsMap['post_impressions'] || 0,
    likes: postData.data.likes?.summary?.total_count || 0,
    comments: postData.data.comments?.summary?.total_count || 0,
    shares: 0,
    clicks: insightsMap['post_clicks'] || 0,
    impressions: insightsMap['post_impressions'] || 0
  };
}

async function getInstagramMetrics(mediaId) {
  const { FACEBOOK_ACCESS_TOKEN } = process.env;
  if (!FACEBOOK_ACCESS_TOKEN || mediaId.startsWith('ig_post_')) return getEmptyMetrics();

  const response = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}/insights`,
    {
      params: {
        metric: 'impressions,reach,engagement,saved,video_views',
        access_token: FACEBOOK_ACCESS_TOKEN
      }
    }
  );

  const insightsMap = {};
  (response.data.data || []).forEach(m => { insightsMap[m.name] = m.values?.[0]?.value || 0; });

  const mediaData = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    {
      params: {
        fields: 'like_count,comments_count',
        access_token: FACEBOOK_ACCESS_TOKEN
      }
    }
  );

  return {
    views: insightsMap['impressions'] || 0,
    likes: mediaData.data.like_count || 0,
    comments: mediaData.data.comments_count || 0,
    shares: insightsMap['saved'] || 0,
    clicks: 0,
    impressions: insightsMap['reach'] || 0
  };
}

async function getTwitterMetrics(tweetId) {
  const { TWITTER_BEARER_TOKEN } = process.env;
  if (!TWITTER_BEARER_TOKEN || tweetId.startsWith('tw_post_')) return getEmptyMetrics();

  const response = await axios.get(
    `https://api.twitter.com/2/tweets/${tweetId}`,
    {
      params: {
        'tweet.fields': 'public_metrics,non_public_metrics'
      },
      headers: { 'Authorization': `Bearer ${TWITTER_BEARER_TOKEN}` }
    }
  );

  const metrics = response.data.data?.public_metrics || {};
  return {
    views: metrics.impression_count || 0,
    likes: metrics.like_count || 0,
    comments: metrics.reply_count || 0,
    shares: metrics.retweet_count || 0,
    clicks: metrics.url_link_clicks || 0,
    impressions: metrics.impression_count || 0
  };
}

module.exports = { collectAllAnalytics, getEmptyMetrics };
