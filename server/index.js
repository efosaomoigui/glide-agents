/**
 * GLIDE Agent Server
 * Social Media Marketing Agent for PAPERLY
 * 
 * This server handles:
 * - WhatsApp webhook (receive & send messages)
 * - REST API for admin dashboard
 * - Social media posting queue
 * - Analytics collection
 * - Agent orchestration via Claude API
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const { runResearch } = require('./research');
const cors = require('cors');
const cron = require('node-cron');
const sqlite = require('sqlite-sync');
const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const twilio = require('twilio');
const fs = require('fs');

// ── Social Media Modules ──────────────────────────────────────────────────────
const { postToTikTok, testTikTokConnection } = require('./social/tiktok');
const { postToFacebook, testFacebookConnection } = require('./social/facebook');
const { postToInstagram, testInstagramConnection } = require('./social/instagram');
const { postToTwitter, testTwitterConnection } = require('./social/twitter');
const { sendTelegramMessage, testTelegramConnection } = require('./social/telegram');
const axios = require('axios');
const { collectAllAnalytics } = require('./analytics/collector');

// ── Init ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/output', express.static(path.join(__dirname, '../data/output')));

// ── Database Setup ────────────────────────────────────────────────────────────
const dbDir = path.join(__dirname, '../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'paperly.db');
console.log('📦 Connecting to database at:', dbPath);
sqlite.connect(dbPath);
const db = sqlite;

console.log('📊 Initial Post count in DB:', db.run('SELECT COUNT(*) as count FROM posts')[0]?.count || 0);

db.run(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    hook TEXT NOT NULL,
    body TEXT NOT NULL,
    cta TEXT NOT NULL,
    height REAL,
    image_prompts TEXT,
    visual_assets TEXT,
    caption TEXT,
    hashtags TEXT,
    status TEXT DEFAULT 'draft',
    platform_post_id TEXT,
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    posted_at DATETIME,
    scheduled_for DATETIME
  );
`);
db.run(`
  CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    platform TEXT NOT NULL,
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    recorded_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    FOREIGN KEY (post_id) REFERENCES posts(id)
  );
`);
db.run(`
  CREATE TABLE IF NOT EXISTS hooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    platform TEXT,
    avg_views REAL DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    last_used DATETIME,
    status TEXT DEFAULT 'untested'
  );
`);
db.run(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);
db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);
db.run(`
  CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message TEXT NOT NULL,
    stack TEXT,
    created_at DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  );
`);
db.run(`
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('auto_post_tiktok', 'false'),
    ('auto_post_facebook', 'true'),
    ('auto_post_instagram', 'true'),
    ('auto_post_twitter', 'true'),
    ('posting_paused', 'false'),
    ('daily_post_limit', '4'),
    ('agent_name', 'GLIDE');
`);

// ── Anthropic Claude Client ───────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Google Gemini Client ──────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

// ── Twilio WhatsApp Client ────────────────────────────────────────────────────
// const twilioClient = twilio(
//   process.env.TWILIO_ACCOUNT_SID,
//   process.env.TWILIO_AUTH_TOKEN
// );

// ── Load Skill File ───────────────────────────────────────────────────────────
const skillPath = path.join(__dirname, '../GLIDEN_SKILL.md');
const GLIDE_SKILL = fs.existsSync(skillPath)
  ? fs.readFileSync(skillPath, 'utf8')
  : 'You are GLIDE, the social media marketing agent for PAPERLY.';

// ── Load Memory Files ─────────────────────────────────────────────────────────
function loadMemory() {
  const memDir = path.join(__dirname, '../memory');
  if (!fs.existsSync(memDir)) fs.mkdirSync(memDir, { recursive: true });

  const files = ['performance-history.md', 'hook-library.md', 'audience-insights.md', 'brand-voice.md', 'research-data.md'];
  let memory = '';
  for (const file of files) {
    const fp = path.join(memDir, file);
    if (fs.existsSync(fp)) {
      memory += `\n\n--- ${file} ---\n${fs.readFileSync(fp, 'utf8')}`;
    }
  }
  return memory;
}

// ── Agent Core: Chat with GLIDE ───────────────────────────────────────────────
async function chatWithGlide(userMessage, includeContext = true) {
  // Save user message
  db.run('INSERT INTO conversations (role, content) VALUES (?, ?)', ['user', userMessage]);

  // Get recent conversation history (last 20 messages)
  const history = db.run(
    'SELECT role, content FROM conversations ORDER BY created_at DESC LIMIT 20'
  ).reverse();

  // Build system prompt with skill + context
  let systemPrompt = GLIDE_SKILL;
  systemPrompt += `\n\n## SYSTEM STATUS\n- Social Media APIs (TikTok, FB, IG, X): CONFIGURED & ACTIVE\n- Automation Mode: ENABLED\n- You HAVE full authority to post to the internet once a draft is marked 'approved' or when you use the 'create_posts' action with direct posting enabled.\n- Do NOT tell the user you lack credentials; they are already set in your environment.`;

  if (includeContext) {
    const memory = loadMemory();
    if (memory) systemPrompt += `\n\n## YOUR MEMORY\n${memory}`;

    // Add recent analytics context
    const recentAnalytics = db.run(`
      SELECT p.platform, p.hook, a.views, a.likes, a.clicks
      FROM posts p LEFT JOIN analytics a ON p.id = a.post_id
      WHERE p.status = 'posted'
      ORDER BY a.recorded_at DESC LIMIT 10
    `);
    if (recentAnalytics.length > 0) {
      systemPrompt += `\n\n## RECENT POST PERFORMANCE\n${JSON.stringify(recentAnalytics, null, 2)}`;
    }
  }

  let assistantMessage = '';
  let usedProvider = 'anthropic';

  try {
    // Attempt Claude first
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 4096,
      system: systemPrompt,
      messages: history.map(h => ({ role: h.role, content: h.content }))
    });
    assistantMessage = response.content[0].text;
  } catch (err) {
    console.warn('⚠️ Anthropic failed, falling back to Gemini:', err.message);
    usedProvider = 'gemini';
    
    try {
      // Fallback to Gemini
      // Combine system prompt and history for Gemini's structure
      
      // Gemini requires the first message in history to be from the 'user'
      let geminiHistory = history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }]
      }));

      // Find first user message
      const firstUserIndex = geminiHistory.findIndex(m => m.role === 'user');
      if (firstUserIndex !== -1) {
        geminiHistory = geminiHistory.slice(firstUserIndex);
      }

      // The last message in 'history' is the current 'userMessage' (inserted at line 159)
      // We should remove it from history because we'll send it via sendMessage
      const messageToSend = geminiHistory.pop();
      const finalUserMessage = messageToSend ? messageToSend.parts[0].text : userMessage;

      const chat = geminiModel.startChat({
        history: geminiHistory,
        generationConfig: { maxOutputTokens: 4096 }
      });

      // Inject system prompt into the first message or as a separate instruction
      const fullPrompt = `SYSTEM INSTRUCTION: ${systemPrompt}\n\nUSER: ${finalUserMessage}`;
      const result = await chat.sendMessage(fullPrompt);
      assistantMessage = result.response.text();
    } catch (geminiErr) {
      console.error('❌ Both Anthropic and Gemini failed');
      db.run('INSERT INTO errors (message, stack) VALUES (?, ?)', [geminiErr.message, geminiErr.stack]);
      throw geminiErr;
    }
  }

  console.log(`🤖 Agent response via ${usedProvider}`);

  // Save assistant response
  db.run('INSERT INTO conversations (role, content) VALUES (?, ?)', ['assistant', assistantMessage]);

  // Parse if response contains structured content (JSON blocks)
  // Look for JSON block in markdown or just raw braces
  let jsonString = '';
  const markdownMatch = assistantMessage.match(/```json\n?([\s\S]*?)\n?```/);
  if (markdownMatch) {
    jsonString = markdownMatch[1];
  } else {
    // Fallback: search for first { and last }
    const firstBrace = assistantMessage.indexOf('{');
    const lastBrace = assistantMessage.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = assistantMessage.substring(firstBrace, lastBrace + 1);
    }
  }

  if (jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      await handleStructuredAgentResponse(parsed);
    } catch (e) {
      console.log('Could not parse JSON from agent response. Length:', jsonString.length);
      console.log('Error:', e.message);
      db.run('INSERT INTO errors (message, stack) VALUES (?, ?)', 
        [`JSON Parse Error: ${e.message}`, assistantMessage.substring(0, 500)]);
    }
  }

  return assistantMessage;
}

// ── Visual Rendering Module ──────────────────────────────────────────────────
const renderer = require('./render/renderer');
const { uploadToR2 } = require('./social/r2');

// ── Handle Structured Agent Responses ────────────────────────────────────────
async function handleStructuredAgentResponse(data) {
  console.log('📦 Handling structured agent response. Action:', data.action);
  
  if (data.action === 'create_posts' && data.posts) {
    console.log(`📝 Attempting to save ${data.posts.length} posts...`);
    for (const [index, post] of data.posts.entries()) {
      try {
        const autoPost = db.run("SELECT value FROM settings WHERE key = ?", [`auto_post_${post.platform}`])[0]?.value === 'true';
        const result = db.insert('posts', {
          platform: post.platform,
          hook: post.hook || '',
          body: post.body || '',
          cta: post.cta || '',
          image_prompts: JSON.stringify(post.image_prompts || []),
          visual_assets: JSON.stringify(post.visual_assets || []),
          caption: post.caption || '',
          hashtags: JSON.stringify(post.hashtags || []),
          status: 'draft', // Forced
          scheduled_for: post.scheduled_for || null
        });
        const postId = result;
        console.log(`   [Post ${index+1}] Saved for ${post.platform}. ID: ${postId || 'unknown'}`);

        // If visual content is requested, render it now
        if (post.visual_content && postId) {
          console.log(`   [Post ${index+1}] Rendering visual content...`);
          try {
            let assetPaths = [];
            if (post.visual_content.template_type === 'single_post') {
              // Force format to square for maximum "coolness" stability
              const renderData = { ...post.visual_content.data, format: 'square' };
              const filename = await renderer.renderSinglePost(renderData, post.visual_content.version || 1);
              assetPaths = [`/output/${filename}`];
            } else if (post.visual_content.template_type === 'carousel') {
              const renderData = { ...post.visual_content.data, format: post.visual_content.format || 'square' };
              const filenames = await renderer.renderCarousel(renderData, post.visual_content.version || 1);
              assetPaths = filenames.map(f => `/output/${f}`);
            }

            if (assetPaths.length > 0) {
              // Upload to R2 if credentials exist
              const publicUrls = [];
              for (const assetPath of assetPaths) {
                const fullLocalPath = path.resolve(__dirname, '../data', assetPath.replace(/^\//, ''));
                const fileName = assetPath.split('/').pop();
                const r2Url = await uploadToR2(fullLocalPath, fileName);
                if (r2Url) {
                  publicUrls.push(r2Url);
                } else {
                  publicUrls.push(assetPath); // Fallback to local path
                }
              }
              db.run("UPDATE posts SET visual_assets = ? WHERE id = ?", [JSON.stringify(publicUrls), postId]);
              console.log(`   [Post ${index+1}] ✅ Visual assets processed: ${publicUrls.length} files`);

              // CLEANUP: Delete local files after successful CDN upload
              if (publicUrls.every(url => url.startsWith('http'))) {
                for (const assetPath of assetPaths) {
                  const fullPath = path.resolve(__dirname, '../data', assetPath.replace(/^\//, ''));
                  try { if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath); } catch (e) {}
                }
                console.log(`   [Post ${index+1}] 🗑️ Local assets cleaned up.`);
              }
            }
          } catch (renderErr) {
            console.error(`   [Post ${index+1}] ❌ Rendering failed:`, renderErr.message);
            db.run('INSERT INTO errors (message, stack) VALUES (?, ?)', 
              [`Render Error: ${renderErr.message}`, post.visual_content.template_type]);
          }
        }

        // AUTO-POST if approved
        const finalPost = db.run("SELECT * FROM posts WHERE id = ?", [postId])[0];
        if (finalPost && finalPost.status === 'approved') {
          console.log(`   [Post ${index+1}] 🚀 Auto-posting to ${post.platform}...`);
          // Use a small delay to ensure rendering artifacts are flushed if needed
          setTimeout(() => postContent(finalPost), 1000);
        }
      } catch (err) {
        console.error(`   [Post ${index+1}] Database insertion failed:`, err.message);
        db.run('INSERT INTO errors (message, stack) VALUES (?, ?)', 
          [`Post Save Error: ${err.message}`, JSON.stringify(post).substring(0, 500)]);
      }
    }
    console.log(`✅ Finished saving posts. Total processed: ${data.posts.length}`);
  }

  if (data.action === 'save_hook' && data.hook) {
    try {
      db.insert('hooks', {
        text: data.hook.text,
        platform: data.hook.platform || 'all',
        status: 'untested'
      });
      console.log('✅ Saved hook to library');
    } catch (err) {
      console.error('❌ Failed to save hook:', err.message);
    }
  }

  if (data.action === 'clear_posts') {
    try {
      db.run("DELETE FROM posts");
      console.log('✅ All posts cleared from database');
    } catch (err) {
      console.error('❌ Failed to clear posts:', err.message);
    }
  }

  if (data.action === 'clear_analytics') {
    try {
      db.run("DELETE FROM analytics");
      console.log('✅ All analytics cleared from database');
    } catch (err) {
      console.error('❌ Failed to clear analytics:', err.message);
    }
  }
}

// ── Notifications: Send to Telegram (Primary) or WhatsApp ─────────────────────
async function sendNotification(message) {
  console.log(`📡 Sending notification: ${message.substring(0, 50)}...`);
  
  // Try Telegram first
  const tgSuccess = await sendTelegramMessage(message);
  if (tgSuccess) return;

  // Fallback to WhatsApp if configured
  try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await twilioClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${process.env.OWNER_WHATSAPP_NUMBER}`,
        body: message
      });
      console.log('✅ WhatsApp notification sent');
    }
  } catch (err) {
    console.error('❌ Notification fallback failed:', err.message);
  }
}

// Keep sendWhatsApp for backward compatibility if needed in other modules
const sendWhatsApp = sendNotification;

// ── WhatsApp Webhook ──────────────────────────────────────────────────────────
app.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200); // Acknowledge immediately

  const incomingMsg = req.body.Body?.trim();
  const from = req.body.From;

  if (!incomingMsg) return;

  // Only respond to owner's number
  const ownerNumber = `whatsapp:${process.env.OWNER_WHATSAPP_NUMBER}`;
  if (from !== ownerNumber) {
    console.log('Message from unknown number, ignoring:', from);
    return;
  }

  console.log(`📱 WhatsApp from owner: "${incomingMsg}"`);

  // Handle special commands
  const cmd = incomingMsg.toLowerCase();

  if (cmd === 'pause') {
    db.run("UPDATE settings SET value = 'true' WHERE key = 'posting_paused'");
    await sendWhatsApp('⏸️ *PAPERLY:* All posting has been paused. Send "resume" to continue.');
    return;
  }

  if (cmd === 'resume') {
    db.run("UPDATE settings SET value = 'false' WHERE key = 'posting_paused'");
    await sendWhatsApp('▶️ *PAPERLY:* Posting resumed! I\'m back on it.');
    return;
  }

  if (cmd === 'status') {
    const stats = getDashboardStats();
    await sendWhatsApp(
      `📊 *GLIDE Status Report*\n\n` +
      `Posts this week: ${stats.postsThisWeek}\n` +
      `Total views (7d): ${stats.totalViews.toLocaleString()}\n` +
      `Drafts queued: ${stats.draftsQueued}\n` +
      `Posting: ${stats.postingPaused ? '⏸ PAUSED' : '▶️ ACTIVE'}\n\n` +
      `Platforms: TikTok ${stats.platforms.tiktok} | FB ${stats.platforms.facebook} | IG ${stats.platforms.instagram} | X ${stats.platforms.twitter}`
    );
    return;
  }

  // For all other messages, route to GLIDE agent
  try {
    await sendWhatsApp('🤔 *PAPERLY:* On it...');
    const response = await chatWithGlide(incomingMsg);
    
    // Split long responses into chunks (WhatsApp has 1600 char limit)
    const chunks = response.match(/.{1,1500}(\s|$)/gs) || [response];
    for (const chunk of chunks) {
      await sendWhatsApp(`*PAPERLY:* ${chunk.trim()}`);
    }
  } catch (err) {
    console.error('Agent error:', err);
    await sendNotification('❌ *GLIDE:* I hit an error. Check the dashboard for details.');
  }
});

// ── Telegram: Long Polling for Commands ───────────────────────────────────────
let lastUpdateId = 0;
async function runTelegramPolling() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const response = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, {
      params: { offset: lastUpdateId + 1, timeout: 30 }
    });

    const updates = response.data.result;
    for (const update of updates) {
      lastUpdateId = update.update_id;
      if (!update.message || !update.message.text) continue;

      const incomingMsg = update.message.text.trim();
      const chatId = update.message.chat.id;

      // Security check: Only respond to owner chat ID
      if (String(chatId) !== String(process.env.TELEGRAM_CHAT_ID)) {
        console.log(`⚠️ Unauthorized Telegram message from ${chatId}: ${incomingMsg}`);
        continue;
      }

      console.log(`📱 Telegram from owner: "${incomingMsg}"`);
      const cmd = incomingMsg.toLowerCase();

      if (cmd === 'pause') {
        db.run("UPDATE settings SET value = 'true' WHERE key = 'posting_paused'");
        await sendNotification('⏸️ *GLIDE:* All posting has been paused. Send "resume" to continue.');
      } 
      else if (cmd === 'resume') {
        db.run("UPDATE settings SET value = 'false' WHERE key = 'posting_paused'");
        await sendNotification('▶️ *GLIDE:* Posting resumed! I\'m back on it.');
      } 
      else if (cmd === 'status') {
        const stats = getDashboardStats();
        await sendNotification(
          `📊 *GLIDE Status Report*\n\n` +
          `Posts this week: ${stats.postsThisWeek}\n` +
          `Total views (7d): ${stats.totalViews.toLocaleString()}\n` +
          `Drafts queued: ${stats.draftsQueued}\n` +
          `Posting: ${stats.postingPaused ? '⏸ PAUSED' : '▶️ ACTIVE'}\n\n` +
          `Platforms: TikTok ${stats.platforms.tiktok} | FB ${stats.platforms.facebook} | IG ${stats.platforms.instagram} | X ${stats.platforms.twitter}`
        );
      } 
      else {
        // Route to GLIDE agent
        try {
          // Notify "Thinking..."
    await sendNotification('🤔 *GLIDE:* Thinking...');
          const response = await chatWithGlide(incomingMsg);
          
          // Split long responses
          const chunks = response.match(/.{1,1500}(\s|$)/gs) || [response];
          for (const chunk of chunks) {
            await sendNotification(`*GLIDE:* ${chunk.trim()}`);
          }
        } catch (err) {
          console.error('Telegram Agent error:', err);
          await sendNotification('❌ *GLIDE:* I hit an error. Check the logs.');
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ETIMEDOUT' && err.code !== 'ECONNRESET') {
      console.error('Telegram polling error:', err.message);
    }
  }

  // Next poll
  setTimeout(runTelegramPolling, 3000);
}

// ── Dashboard Stats Helper ────────────────────────────────────────────────────
function getDashboardStats() {
  try {
    const rawPostsThisWeek = db.run("SELECT COUNT(*) as count FROM posts WHERE created_at >= datetime('now', '-7 days') AND status = 'posted'");
    const postsThisWeek = (rawPostsThisWeek[0]?.count) || 0;

    const rawTotalViews = db.run("SELECT COALESCE(SUM(views), 0) as total FROM analytics WHERE recorded_at >= datetime('now', '-7 days')");
    const totalViews = (rawTotalViews[0]?.total) || 0;

    const rawTotalLikes = db.run("SELECT COALESCE(SUM(likes), 0) as total FROM analytics WHERE recorded_at >= datetime('now', '-7 days')");
    const totalLikes = (rawTotalLikes[0]?.total) || 0;

    const rawDraftsQueued = db.run("SELECT COUNT(*) as count FROM posts WHERE status IN ('draft', 'approved', 'failed')");
    const draftsQueued = (rawDraftsQueued[0]?.count) || 0;

    const rawTotalPosts = db.run("SELECT COUNT(*) as count FROM posts WHERE status = 'posted'");
    const totalPosts = (rawTotalPosts[0]?.count) || 0;

    const rawPostingPaused = db.run("SELECT value FROM settings WHERE key = 'posting_paused'");
    const postingPaused = rawPostingPaused[0]?.value === 'true';

    const platforms = {
      tiktok: (db.run("SELECT COUNT(*) as c FROM posts WHERE platform='tiktok' AND status='posted'")[0]?.c) || 0,
      facebook: (db.run("SELECT COUNT(*) as c FROM posts WHERE platform='facebook' AND status='posted'")[0]?.c) || 0,
      instagram: (db.run("SELECT COUNT(*) as c FROM posts WHERE platform='instagram' AND status='posted'")[0]?.c) || 0,
      twitter: (db.run("SELECT COUNT(*) as c FROM posts WHERE platform='twitter' AND status='posted'")[0]?.c) || 0,
    };

    const stats = { postsThisWeek, totalViews, totalLikes, draftsQueued, postingPaused, platforms, totalPosts };
    console.log('📊 Stats Sub-counts:', { postsThisWeek, draftsQueued, totalPosts });
    return stats;
  } catch (err) {
    console.error('Error calculating dashboard stats:', err.message);
    return { 
      postsThisWeek: 0, totalViews: 0, totalLikes: 0, draftsQueued: 0, 
      postingPaused: false, platforms: { tiktok:0, facebook:0, instagram:0, twitter:0 }, totalPosts: 0 
    };
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', agent: 'GLIDE', version: '1.0.0', timestamp: new Date() });
});

// Dashboard stats
app.get('/api/stats', (req, res) => {
  res.json(getDashboardStats());
});

// Get all posts
app.get('/api/posts', (req, res) => {
  const { platform, status, limit = 50 } = req.query;
  let query = 'SELECT * FROM posts';
  const params = [];
  const where = [];

  if (platform) { where.push('platform = ?'); params.push(platform); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (where.length) query += ' WHERE ' + where.join(' AND ');

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  res.json(db.run(query, params));
});

// Get single post
app.get('/api/posts/:id', (req, res) => {
  const post = db.run('SELECT * FROM posts WHERE id = ?', [req.params.id])[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const analytics = db.run('SELECT * FROM analytics WHERE post_id = ?', [req.params.id]);
  res.json({ ...post, analytics });
});

// Approve and queue a draft post
app.post('/api/posts/:id/approve', async (req, res) => {
  const post = db.run('SELECT * FROM posts WHERE id = ?', [req.params.id])[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });

  db.run("UPDATE posts SET status = 'approved' WHERE id = ?", [req.params.id]);

  // Auto-post if enabled for this platform
  const autoPostKey = `auto_post_${post.platform}`;
  const autoPostValue = db.run('SELECT value FROM settings WHERE key = ?', [autoPostKey])[0]?.value;
  const autoPost = autoPostValue === 'true';
  const paused = db.run("SELECT value FROM settings WHERE key = 'posting_paused'")[0]?.value === 'true';

  if (autoPost && !paused) {
    try {
      await postContent(post);
      res.json({ success: true, message: `Post approved and successfully posted to ${post.platform}` });
    } catch (err) {
      res.json({ success: true, message: `Post approved, but failed to post: ${err.message}` });
    }
  } else {
    res.json({ success: true, message: 'Post approved and queued for posting' });
  }
});

// Manual post now
app.post('/api/posts/:id/post-now', async (req, res) => {
  const post = db.run('SELECT * FROM posts WHERE id = ?', [req.params.id])[0];
  if (!post) return res.status(404).json({ error: 'Post not found' });

  try {
    await postContent(post);
    res.json({ success: true, message: `Posted to ${post.platform}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a post
app.delete('/api/posts/:id', (req, res) => {
  db.run('DELETE FROM posts WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// Get analytics
app.get('/api/analytics', (req, res) => {
  const { days = 7 } = req.query;
  const data = db.run(`
    SELECT p.platform, p.hook, a.views, a.likes, a.comments, a.shares, a.clicks, a.recorded_at
    FROM posts p LEFT JOIN analytics a ON p.id = a.post_id
    WHERE a.recorded_at >= datetime('now', '-${parseInt(days)} days')
    ORDER BY a.views DESC
  `);
  res.json(data);
});

// Analytics overview per platform
app.get('/api/analytics/overview', (req, res) => {
  const platforms = ['tiktok', 'facebook', 'instagram', 'twitter'];
  const overview = {};

  for (const platform of platforms) {
    overview[platform] = db.run(`
      SELECT 
        COUNT(DISTINCT p.id) as total_posts,
        COALESCE(SUM(a.views), 0) as total_views,
        COALESCE(SUM(a.likes), 0) as total_likes,
        COALESCE(SUM(a.comments), 0) as total_comments,
        COALESCE(SUM(a.clicks), 0) as total_clicks,
        COALESCE(AVG(a.views), 0) as avg_views
      FROM posts p LEFT JOIN analytics a ON p.id = a.post_id
      WHERE p.platform = ? AND p.status = 'posted'
    `, [platform])[0];
  }

  res.json(overview);
});

// Get hooks library
app.get('/api/hooks', (req, res) => {
  const hooks = db.run(
    'SELECT * FROM hooks ORDER BY avg_views DESC'
  );
  res.json(hooks);
});

// Get settings
app.get('/api/settings', (req, res) => {
  const settings = db.run('SELECT * FROM settings');
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
});

// Update settings
app.put('/api/settings', (req, res) => {
  const updates = req.body;
  const query = 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)';
  for (const [key, value] of Object.entries(updates)) {
    db.run(query, [key, String(value)]);
  }
  res.json({ success: true });
});

// Test platform connection
app.post('/api/platforms/:platform/test', async (req, res) => {
  const { platform } = req.params;
  try {
    let result;
    switch (platform) {
      case 'tiktok': result = await testTikTokConnection(); break;
      case 'facebook': result = await testFacebookConnection(); break;
      case 'instagram': result = await testInstagramConnection(); break;
      case 'twitter': result = await testTwitterConnection(); break;
    case 'telegram': result = await testTelegramConnection(); break;
      case 'anthropic': result = await testAnthropicConnection(); break;
      case 'gemini': result = await testGeminiConnection(); break;
      default: return res.status(400).json({ error: 'Invalid platform' });
    }
    res.json({ success: true, platform, data: result });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`Test failed for ${platform}:`, detail);
    db.run('INSERT INTO errors (message, stack) VALUES (?, ?)', 
      [`API Test Error (${platform}): ${detail}`, err.stack]);
    res.status(500).json({ error: detail });
  }
});

async function testAnthropicConnection() {
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 1,
    messages: [{ role: 'user', content: 'health check' }]
  });
  return { status: 'success', model: response.model };
}

async function testGeminiConnection() {
  const result = await geminiModel.generateContent('health check');
  return { status: 'success', response: result.response.text().substring(0, 50) + '...' };
}

// Trigger web research
app.post('/api/research', async (req, res) => {
  try {
    const data = await runResearch();
    res.json({ success: true, data });
  } catch (err) {
    db.run('INSERT INTO errors (message, stack) VALUES (?, ?)', [`Research Error: ${err.message}`, err.stack]);
    res.status(500).json({ error: err.message });
  }
});

// Chat with GLIDE from dashboard
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const response = await chatWithGlide(message);
    res.json({ response });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get conversation history
app.get('/api/conversations', (req, res) => {
  const history = db.run(
    'SELECT * FROM conversations ORDER BY created_at DESC LIMIT 100'
  ).reverse();
  res.json(history);
});

// Get error logs
app.get('/api/logs', (req, res) => {
  const logs = db.run('SELECT * FROM errors ORDER BY created_at DESC LIMIT 100');
  res.json(logs);
});

// Clear error logs
app.post('/api/logs/clear', (req, res) => {
  db.run('DELETE FROM errors');
  res.json({ success: true });
});

// Generate content via GLIDE
app.post('/api/generate', async (req, res) => {
  const { platforms, count = 6, theme } = req.body;
  
  try {
    console.log('🔍 Refreshing intelligence from Paperly.online...');
    await runResearch();
  } catch (err) {
    console.error('⚠️ Research fetch failed:', err.message);
  }

  const prompt = `Generate a high-quality mix of social media posts for Paperly.
Target: 3 for Facebook, 3 for Instagram.

RULES:
- Facebook/Instagram: NEVER text-only. MUST include a visual asset.
- Template Types: "single_post" or "carousel".
- Visual Format: Always "square".
- RANDOMLY pick version "1", "2", or "3" for every post — vary it!

IMAGE SELECTION RULE (CRITICAL):
You MUST always include an image_url for every post and every carousel slide.
Choose the image source based on the story content:

1. SPECIFIC PERSON / PLACE / AUTHORITY (e.g. Tinubu, El-Rufai, Pope Leo, Aso Rock, Dangote, CBN headquarters):
   → Find a real photo URL from a public news source, Wikipedia, or reliable news image.
   → Example: https://upload.wikimedia.org/wikipedia/commons/thumb/.../Bola_Tinubu.jpg
   → Use actual web image URLs — NOT Unsplash for these.

2. ABSTRACT / THEMATIC TOPIC (e.g. economy, security, inflation, energy, elections in general):
   → Use a relevant Unsplash photo URL.
   → Example: https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1080&q=85
   → Pick images that MATCH the theme: power tower for energy, court/gavel for law, etc.

NEVER use a generic camera or placeholder image. Every image must match the story.

Return ONLY the following JSON (no conversational text before or after):
\`\`\`json
{
  "action": "create_posts",
  "posts": [
    {
      "platform": "facebook",
      "hook": "...",
      "body": "...",
      "cta": "...",
      "caption": "...",
      "hashtags": ["#..."],
      "visual_content": {
        "template_type": "single_post",
        "version": "2",
        "format": "square",
        "data": {
          "headline": "...",
          "summary": "...",
          "sector": "...",
          "sources": "Punch · The Nation",
          "image_url": "https://images.unsplash.com/photo-SPECIFIC-TO-STORY?w=1080&q=85"
        }
      }
    },
    {
      "platform": "facebook",
      "hook": "...",
      "body": "...",
      "cta": "...",
      "caption": "...",
      "hashtags": ["#..."],
      "visual_content": {
        "template_type": "carousel",
        "version": "1",
        "format": "square",
        "data": {
          "slides": [
            {
              "type": "cover"
            },
            {
              "type": "story",
              "headline": "Exact headline from paperly.online hero story 1",
              "sector": "Security",
              "bullets": [
                "Key fact 1 — reduced to fit the slide space",
                "Key fact 2 — keep concise, max 12 words per bullet",
                "Key fact 3 — source or development status"
              ],
              "image_url": "https://images.unsplash.com/photo-RELEVANT-TO-STORY-1?w=900&q=85"
            },
            {
              "type": "story",
              "headline": "Exact headline from paperly.online hero story 2",
              "sector": "Economy",
              "bullets": [
                "Key fact 1 — reduced to fit the slide space",
                "Key fact 2 — keep concise, max 12 words per bullet",
                "Key fact 3 — source or development status"
              ],
              "image_url": "https://images.unsplash.com/photo-RELEVANT-TO-STORY-2?w=900&q=85"
            },
            {
              "type": "story",
              "headline": "Exact headline from paperly.online hero story 3",
              "sector": "Politics",
              "bullets": [
                "Key fact 1 — reduced to fit the slide space",
                "Key fact 2 — keep concise, max 12 words per bullet",
                "Key fact 3 — source or development status"
              ],
              "image_url": "https://images.unsplash.com/photo-RELEVANT-TO-STORY-3?w=900&q=85"
            },
            {
              "type": "cta"
            }
          ]
        }
      }
    }
  ]
}
\`\`\`
CAROUSEL RULES:
- The cover slide (type: "cover") is ALWAYS fixed — the template auto-shows "Today's Intel Brief" with today's date. Do NOT change it.
- Story slides (type: "story") map DIRECTLY to stories from the paperly.online hero carousel. Use their headlines verbatim, reduced bullets to fit space (max 3 bullets, max 12 words each).
- CTA slide (type: "cta") is also fixed — just pass the type.
- Use exactly 3 story slides to match the 3 template story slots.

CRITICAL: Output exactly 6 posts (3 FB, 3 IG). Use REAL story-relevant image URLs. Ensure valid JSON. Output ONLY JSON.`;
  try {
    const response = await chatWithGlide(prompt);
    res.json({ response, message: 'Content generation complete. Check drafts.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Post Content to Platforms ─────────────────────────────────────────────────
async function postContent(post) {
  let platformPostId = null;
  console.log(`🚀 [Post ${post.id}] Starting post to ${post.platform}...`);

  try {
    switch (post.platform) {
      case 'tiktok':
        platformPostId = await postToTikTok(post);
        break;
      case 'facebook':
        platformPostId = await postToFacebook(post);
        break;
      case 'instagram':
        platformPostId = await postToInstagram(post);
        break;
      case 'twitter':
        platformPostId = await postToTwitter(post);
        break;
      default:
        throw new Error(`Unsupported platform: ${post.platform}`);
    }

    console.log(`✅ [Post ${post.id}] API success. Platform ID: ${platformPostId}`);

    // Refactored to single line string to avoid multi-line query issues with sqlite-sync
    const query = "UPDATE posts SET status = 'posted', platform_post_id = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ?";
    const updateResult = db.run(query, [platformPostId, post.id]);

    console.log(`📝 [Post ${post.id}] Database status updated to 'posted'. Result:`, updateResult);

    // Notify owner via GLIDE
    await sendNotification(
      `✅ *GLIDE:* Posted to ${post.platform}!\n\n` +
      `Hook: "${post.hook.substring(0, 80)}..."\n\n` +
      `I'll check analytics in 24 hours.`
    );

    // Schedule analytics check in 24h
    setTimeout(async () => {
      console.log(`📊 [Post ${post.id}] Running scheduled analytics collection...`);
      await collectAndStoreAnalytics(post.id, post.platform, platformPostId);
    }, 24 * 60 * 60 * 1000);

  } catch (err) {
    console.error(`❌ [Post ${post.id}] Failed to post to ${post.platform}:`, err.message);
    db.run("UPDATE posts SET status = 'failed' WHERE id = ?", [post.id]);
    db.run('INSERT INTO errors (message, stack, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)', 
      [`Post Error (${post.platform}): ${err.message}`, err.stack]);
    await sendNotification(`❌ *GLIDE:* Failed to post to ${post.platform}: ${err.message}`);
  }
}

// ── Collect Analytics ─────────────────────────────────────────────────────────
async function collectAndStoreAnalytics(postId, platform, platformPostId) {
  try {
    const metrics = await collectAllAnalytics(platform, platformPostId);

    db.run(`
      INSERT INTO analytics (post_id, platform, views, likes, comments, shares, clicks)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [postId, platform, metrics.views, metrics.likes, metrics.comments, metrics.shares, metrics.clicks]);

    // Update hook performance
    const post = db.run('SELECT hook FROM posts WHERE id = ?', [postId])[0];
    if (post) {
      const existing = db.run('SELECT * FROM hooks WHERE text = ?', [post.hook])[0];
      if (existing) {
        const newAvg = (existing.avg_views * existing.usage_count + metrics.views) / (existing.usage_count + 1);
        db.run('UPDATE hooks SET avg_views = ?, usage_count = usage_count + 1 WHERE text = ?',
          [newAvg, post.hook]);
      }
    }

    console.log(`📊 Analytics recorded for post ${postId}: ${JSON.stringify(metrics)}`);
  } catch (err) {
    console.error('Analytics collection error:', err.message);
  }
}

// ── Scheduled Jobs ────────────────────────────────────────────────────────────

// Helper function for session generation
async function runSession(sessionName) {
  const paused = db.run("SELECT value FROM settings WHERE key = 'posting_paused'")[0]?.value === 'true';
  if (paused) return;

  console.log(`🕗 Running ${sessionName} session...`);
  
  
  // 2. Generate Content
  await chatWithGlide(
    `It's the ${sessionName} session. Based on the latest research from Paperly.online, generate the 3x3 mix for Facebook and Instagram (3 image/text posts + 3 carousels for each). Send me a brief progress summary.`
  );
}

// MORNING: Every day at 8am
cron.schedule('0 8 * * *', () => runSession('Morning'));

// AFTERNOON: Every day at 2pm
cron.schedule('0 14 * * *', () => runSession('Afternoon'));

// EVENING: Every day at 8pm
cron.schedule('0 20 * * *', () => runSession('Evening'));

// Weekly report: Every Monday at 9am
cron.schedule('0 9 * * 1', async () => {
  console.log('📋 Running weekly report...');
  const response = await chatWithGlide(
    'Please generate this week\'s full performance report. Include total views, best posts, what worked and what didn\'t, and your recommended strategy for the coming week.'
  );
  await sendNotification(`📋 *Weekly Report*\n\n${response}`);
});

// Every 6 hours - collect analytics for recent posts
cron.schedule('0 */6 * * *', async () => {
  console.log('📊 Periodic sync: Analytics...');
  const recentPosts = db.run(`
    SELECT id, platform, platform_post_id FROM posts 
    WHERE status = 'posted' 
    AND posted_at >= datetime('now', '-7 days')
    AND platform_post_id IS NOT NULL
  `);

  for (const post of recentPosts) {
    await collectAndStoreAnalytics(post.id, post.platform, post.platform_post_id);
  }
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`
    ╔═══════════════════════════════════════╗
    ║   GLIDE Agent Server — Paperly.online   ║
    ╠═══════════════════════════════════════╣
    ║  Server:    http://localhost:${PORT}       ║
    ║  Dashboard: http://localhost:4002     ║
    ║  WhatsApp:  /webhook/whatsapp         ║
    ╚═══════════════════════════════════════╝
    `);

    // Morning Telegram greeting / Polling start
    if (process.env.TELEGRAM_BOT_TOKEN) {
      console.log('🤖 Starting Telegram command polling...');
      runTelegramPolling();
      sendNotification('🌅 *GLIDE is online!* Good morning. I am ready to market Paperly via Telegram.').catch(() => {});
    }
  });
}

module.exports = { app, db, chatWithGlide, sendWhatsApp, postContent, handleStructuredAgentResponse };
