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
const multer = require('multer');
const crypto = require('crypto');

// ── Social Media Modules ──────────────────────────────────────────────────────
const { postToTikTok, testTikTokConnection } = require('./social/tiktok');
const { postToFacebook, testFacebookConnection } = require('./social/facebook');
const { postToInstagram, testInstagramConnection } = require('./social/instagram');
const { postToTwitter, testTwitterConnection } = require('./social/twitter');
const { sendTelegramMessage, testTelegramConnection } = require('./social/telegram');
const { postToLinkedIn, testLinkedInConnection } = require('./social/linkedin');
const { postToReddit, testRedditConnection } = require('./social/reddit');
const axios = require('axios');
const { collectAllAnalytics } = require('./analytics/collector');

// ── Init ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname, '../assets')));
app.use('/output', express.static(path.join(__dirname, '../data/output')));
app.use('/local-images', express.static(path.join(__dirname, '../data/local-images')));

// Add dashboard auth
app.use('/api', (req, res, next) => {
  // Allow health check to be unauthenticated so the dashboard can verify connection
  if (req.path === '/health') return next();
  
  if (!process.env.DASHBOARD_PASSWORD) {
    return next(); // If no password set, allow access
  }

  const authHeader = req.headers.authorization || '';
  if (authHeader === `Bearer ${process.env.DASHBOARD_PASSWORD}`) {
    return next();
  }
  
  return res.status(401).json({ error: 'Unauthorized: Invalid dashboard password' });
});

// ── Multer Storage Configuration ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../data/local-images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Use user-provided name if available, else clean up original name
    const customName = req.body.name ? req.body.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() : null;
    const ext = path.extname(file.originalname);
    const finalName = customName ? `${customName}${ext}` : `${Date.now()}-${file.originalname}`;
    cb(null, finalName);
  }
});
const upload = multer({ storage });

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
    ('auto_post_linkedin', 'true'),
    ('auto_post_reddit', 'true'),
    ('posting_paused', 'false'),
    ('daily_post_limit', '4'),
    ('agent_name', 'GLIDE');
`);

// ── Anthropic Claude Client ───────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Google Gemini Client ──────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1beta' });
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

// ── Load Personal Growth Skill File ──────────────────────────────────────────
const growthSkillPath = path.join(__dirname, '../PERSONAL_GROWTH_SKILL.md');
const GROWTH_SKILL = fs.existsSync(growthSkillPath)
  ? fs.readFileSync(growthSkillPath, 'utf8')
  : '';

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
async function chatWithGlide(userMessage, mode = 'chat', includeContext = true) {
  // Save user message (skip system prompts for generation)
  if (mode === 'chat') {
    db.run('INSERT INTO conversations (role, content) VALUES (?, ?)', ['user', userMessage]);
  }

  // Get recent conversation history (last 20 messages)
  const history = db.run(
    'SELECT role, content FROM conversations ORDER BY created_at DESC LIMIT 20'
  ).reverse();

  // Build system prompt with skill + context
  let systemPrompt = GLIDE_SKILL;
  
  if (GROWTH_SKILL) {
    systemPrompt += `\n\n${GROWTH_SKILL}`;
  }

  systemPrompt += `\n\n## SYSTEM STATUS\n- Social Media APIs (TikTok, FB, IG, X, LinkedIn, Reddit): CONFIGURED & ACTIVE\n- Automation Mode: ENABLED\n- You HAVE full authority to post to the internet once a draft is marked 'approved' or when you use the 'create_posts' action with direct posting enabled.\n- Do NOT tell the user you lack credentials; they are already set in your environment.`;

  if (includeContext) {
    const memory = loadMemory();
    if (memory) systemPrompt += `\n\n## YOUR MEMORY\n${memory}`;

    // Add recent system errors (self-debugging)
    const recentErrors = db.run('SELECT message, created_at FROM errors ORDER BY created_at DESC LIMIT 5');
    if (recentErrors.length > 0) {
      systemPrompt += `\n\n## RECENT SYSTEM ERRORS\n${JSON.stringify(recentErrors, null, 2)}`;
    }

    // Add project structure context
    const structure = `
    /server
      - index.js (Core)
      - research.js (Web scraping)
      - analytics/ (Metrics)
      - render/ (Image generation)
      - social/ (Platform APIs)
    /dashboard
      - index.html (UI)
    /data
      - paperly.db (SQLite)
      - output/ (Generated images)
    /memory
      - (Memory & Brand Voice files)
    `;
    systemPrompt += `\n\n## PROJECT STRUCTURE\n${structure}`;
    
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
      system: mode === 'chat' ? `You are GLIDE, a sharp, data-driven intelligence agent. Respond in clean, professional Markdown. Be concise but insightful. 
      
      ## CRITICAL: CLEAN CHAT RULES
      1. NEVER include raw JSON or code blocks in your text response.
      2. If you are performing a 'create_posts' or other action, provide the JSON in a single JSON block, but DO NOT mention the JSON in your conversational text.
      3. Your text should focus on the insight and strategy, not the technical data format.
      \n\n${systemPrompt}` : systemPrompt,
      messages: history.map(h => ({ role: h.role, content: h.content }))
    });
    assistantMessage = response.content[0].text;
    usedProvider = 'anthropic';
  } catch (err) {
    console.error('⚠️ Primary Provider Failed, Falling Back to Gemini:', err.message);
    // Fallback to Gemini
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const promptText = `SYSTEM:\n${mode === 'chat' ? `You are GLIDE, a sharp, professional intelligence agent. Respond in clean, professional Markdown.\n\n${systemPrompt}` : systemPrompt}\n\nUSER:\n${userMessage}`;
      const result = await model.generateContent(promptText);
      assistantMessage = result.response.text();
      usedProvider = 'gemini-flash';
    } catch (gErr) {
      console.error('❌ Both Providers Failed:', gErr.message);
      throw gErr;
    }
  }

  if (mode === 'chat') {
    db.run('INSERT INTO conversations (role, content) VALUES (?, ?)', ['assistant', assistantMessage]);
  }
  return assistantMessage; // Removed .replace(/```json|```/g, '').trim() as processAgentResponse will handle it
}

/**
 * Ensures a web image is saved locally for consistency and future reuse.
 * @param {string} url - The web image URL
 * @param {string} topic - The topic name to use for the file
 * @returns {Promise<string>} - The local path or original URL on failure
 */
async function ensureLocalImage(url, topic = 'general') {
  const dir = path.join(__dirname, '../data/local-images');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // STEP 1: LOCAL SEARCH (Priority #1)
  // Scan local folder for the BEST matching image whose filename contains keywords from the topic
  try {
    const localFiles = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    
    // Split topic into keywords
    const keywords = topic.toLowerCase().split(/[^\w\d]+/).filter(k => k.length > 3);

    if (keywords.length > 0) {
      let bestScore = 0;
      let matches = [];

      // Expanded stop words for consistency with R2 search
      const stopWords = [
        'today', 'news', 'intel', 'brief', 'post', 'slide', 'image', 'photo', 'picture', 'paperly',
        'holds', 'against', 'firm', 'says', 'above', 'below', 'after', 'before', 'with', 'from',
        'this', 'that', 'these', 'those', 'will', 'would', 'could', 'should', 'been', 'being',
        'have', 'hath', 'does', 'doing', 'into', 'onto', 'upon', 'about', 'across', 'around',
        'between', 'during', 'through', 'under', 'over', 'while', 'within', 'without'
      ];
      const finalKeywords = keywords.filter(k => !stopWords.includes(k));

      if (finalKeywords.length > 0) {
        for (const file of localFiles) {
          const fileLower = file.toLowerCase();
          let score = 0;
          
          for (const k of finalKeywords) {
            if (fileLower.includes(k)) {
              score++;
              // Bonus for exact word match
              const wordRegex = new RegExp(`(^|[^a-z0-9])${k}([^a-z0-9]|$)`, 'i');
              if (wordRegex.test(fileLower)) score += 1.0;
            }
          }

          if (score > 0) {
            if (score > bestScore) {
              bestScore = score;
              matches = [file];
            } else if (score === bestScore) {
              matches.push(file);
            }
          }
        }
      }

      const MIN_SCORE = 2.0;
      if (matches.length > 0 && bestScore >= MIN_SCORE) {
        // Pick one from the best matches
        const winner = matches[Math.floor(Math.random() * matches.length)];
        console.log(`🎯 LOCAL MATCH FOUND (${bestScore} pts): Using ${winner} for topic "${topic}"`);
        return `/local-images/${winner}`;
      } else if (matches.length > 0) {
        console.log(`ℹ️ Weak local match (${bestScore} pts) for "${topic}". Threshold is ${MIN_SCORE}. Skipping.`);
      }
    }
  } catch (err) {
    console.warn('⚠️ Local image search failed:', err.message);
  }

  // STEP 2: R2 SOURCING (Priority #2) - New Instruction: Exclusive sourcing
  try {
    const r2Url = await getRandomImageFromBucket(topic);
    if (r2Url) {
      console.log(`🎯 R2 SOURCE FOUND: Using ${r2Url} for topic "${topic}"`);
      return r2Url;
    }
  } catch (err) {
    console.warn('⚠️ R2 sourcing failed:', err.message);
  }
  // STEP 3: FALLBACK (Strict R2 only, no web)
  console.warn(`⚠️ No asset found for topic "${topic}". Returning blank.`);
  return '';
}

/**
 * Unifies agent response processing. 
 * Parses JSON actions, handles them, and returns clean Markdown.
 */
async function processAgentResponse(rawResponse, mode = 'chat') {
  let text = rawResponse;
  let json = null;
  let jsonStr = '';

  // 1. EXTRACT & STRIP ALL JSON/CODE BLOCKS
  // We remove all triple-backtick blocks from the 'text' to ensure the user never sees them.
  const blocks = rawResponse.match(/```[\s\S]*?```/g);
  if (blocks) {
    for (const b of blocks) {
      if (b.includes('"action"') && !jsonStr) {
        const match = b.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) jsonStr = match[1].trim();
      }
      text = text.replace(b, '').trim();
    }
  } 

  if (!jsonStr) {
    const braceMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (braceMatch && braceMatch[0].includes('"action"')) {
      jsonStr = braceMatch[0];
      text = text.replace(jsonStr, '').trim();
    }
  }

  // 2. PARSE JSON with Sanitization
  if (jsonStr) {
    try {
      const sanitized = jsonStr
        .replace(/,(\s*[\]\}])/g, '$1') 
        .replace(/(['"])?([a-z0-9A-Z_]+)(['"])?\s*:/g, '"$2":');
      json = JSON.parse(sanitized);
    } catch (e) {
      try { json = JSON.parse(jsonStr); } catch (e2) {
        console.error('❌ JSON Parse Error:', e2.message);
      }
    }
  }
  
  // 3. EXECUTE ACTIONS
  let action = null;
  let data = null;
  
  if (json && json.action) {
    action = json.action;
    data = json;
    try {
      await handleStructuredAgentResponse(json);
      
      const isBoilerplate = !text || text.length < 20 || /glide|here|summary|output|action|json/i.test(text);
      if (json.action === 'create_posts' && isBoilerplate) {
        const count = json.posts ? json.posts.length : 0;
        text = `✅ **Success!** I've generated **${count} draft posts** for you. \n\nYou can review and approve them in the **Queue** tab.`;
      }
    } catch (err) {
      console.error('❌ Action Handler Failed:', err.message);
    }
  }
  
  // Final UI Cleanup (strip any remaining markers)
  text = text.replace(/```json|```/g, '').trim() || "Action processed successfully.";
  
  // Return structured object for web dashboard, but allow string fallback for legacy logs/bots
  const result = {
    text: text,
    action: action,
    data: data,
    toString: () => text 
  };
  
  return result;
}

// ── Visual Rendering Module ──────────────────────────────────────────────────
const renderer = require('./render/renderer');
const { uploadToR2, getRandomImageFromBucket } = require('./social/r2');

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

        // STAGGERED PUBLISHING: Add delay between posts to prevent API Rate Limits (Meta/Twitter)
        if (index > 0) {
          console.log(`   [Post ${index+1}] ⏳ Waiting 15s to respect API rate limits...`);
          await new Promise(r => setTimeout(r, 15000));
        }

            // If visual content is requested, render it now
            if (post.visual_content && postId) {
              console.log(`   [Post ${index+1}] Rendering visual content...`);
              try {
                // STAMP IMAGES LOCALLY: Ensure all images are in the local repo for stability and reuse
                if (post.visual_content.template_type === 'single_post' && post.visual_content.data.image_url) {
                  const localUrl = await ensureLocalImage(post.visual_content.data.image_url, post.visual_content.data.headline || 'post');
                  post.visual_content.data.image_url = localUrl;
                } else if (post.visual_content.template_type === 'carousel' && post.visual_content.data.slides) {
                  for (const slide of post.visual_content.data.slides) {
                    if (slide.image_url) {
                      const localUrl = await ensureLocalImage(slide.image_url, slide.headline || 'carousel');
                      slide.image_url = localUrl;
                    }
                  }
                }

                let assetPaths = [];
            if (post.visual_content.template_type === 'single_post') {
              // Convert to absolute path for the renderer
              const singleData = { ...post.visual_content.data, format: 'square' };
              if (singleData.image_url && singleData.image_url.startsWith('/local-images/')) {
                singleData.image_url = path.join(__dirname, '../data', singleData.image_url.substring(1));
              }
              const filename = await renderer.renderSinglePost(singleData, post.visual_content.version || 1);
              assetPaths = [`/output/${filename}`];
            } else if (post.visual_content.template_type === 'carousel') {
              const carouselData = { ...post.visual_content.data, format: post.visual_content.format || 'square' };
              if (carouselData.slides) {
                carouselData.slides = carouselData.slides.map(slide => {
                  if (slide.image_url && slide.image_url.startsWith('/local-images/')) {
                    return { ...slide, image_url: path.join(__dirname, '../data', slide.image_url.substring(1)) };
                  }
                  return slide;
                });
              }
              const filenames = await renderer.renderCarousel(carouselData, post.visual_content.version || 1);
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
    // Notify "Thinking..."
    await sendWhatsApp('🤔 *PAPERLY:* On it...');
    const rawResponse = await chatWithGlide(incomingMsg);
    const result = await processAgentResponse(rawResponse);
    const responseText = result.text;
    
    // Split long responses into chunks (WhatsApp has 1600 char limit)
    const chunks = responseText.match(/.{1,1500}(\s|$)/gs) || [responseText];
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
          // Refresh research if message implies content creation or news discussion
          const needsResearch = /create|post|generate|news|headline|story|intel/i.test(incomingMsg);
          if (needsResearch) {
            console.log('🔍 [Telegram] Refreshing intelligence before responding...');
            await runResearch().catch(e => console.warn('Research refresh failed:', e.message));
          }

          // Notify "Thinking..."
          await sendNotification('🤔 *GLIDE:* Thinking...');
          const rawResponse = await chatWithGlide(incomingMsg);
          const result = await processAgentResponse(rawResponse);
          const responseText = result.text;
          
          // Split long responses
          const chunks = responseText.match(/.{1,1500}(\s|$)/gs) || [responseText];
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
      linkedin: (db.run("SELECT COUNT(*) as c FROM posts WHERE platform='linkedin' AND status='posted'")[0]?.c) || 0,
      reddit: (db.run("SELECT COUNT(*) as c FROM posts WHERE platform='reddit' AND status='posted'")[0]?.c) || 0,
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
    // Refresh research if message implies content creation or news discussion
    const needsResearch = /create|post|generate|news|headline|story|intel/i.test(message);
    if (needsResearch) {
      console.log('🔍 [Web Chat] Refreshing intelligence before responding...');
      await runResearch().catch(e => console.warn('Research refresh failed:', e.message));
    }

    const rawResponse = await chatWithGlide(message, 'chat');
    const result = await processAgentResponse(rawResponse);
    res.json({ response: result }); // Send the full object {text, action, data}
  } catch (err) {
    console.error('[Web Chat] Error:', err.message);
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

// ── Asset Management ──────────────────────────────────────────────────────────

// List all local images
app.get('/api/local-images', (req, res) => {
  const dir = path.join(__dirname, '../data/local-images');
  if (!fs.existsSync(dir)) return res.json([]);
  
  const files = fs.readdirSync(dir)
    .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
    .map(f => ({
      name: f,
      url: `/local-images/${f}`,
      path: path.join(dir, f),
      size: fs.statSync(path.join(dir, f)).size,
      created_at: fs.statSync(path.join(dir, f)).birthtime
    }))
    .sort((a,b) => b.created_at - a.created_at);
    
  res.json(files);
});

// Upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  console.log(`📁 Asset Uploaded: ${req.file.filename}`);
  res.json({ 
    success: true, 
    file: {
      name: req.file.filename,
      url: `/local-images/${req.file.filename}`
    }
  });
});

// Delete image
app.delete('/api/local-images/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '../data/local-images', filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Purge all images
app.delete('/api/local-images', (req, res) => {
  const dir = path.join(__dirname, '../data/local-images');
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
        fs.unlinkSync(path.join(dir, file));
      }
    }
  }
  res.json({ success: true });
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

// ── Content Prompt Engineering ──────────────────────────────────────────────
function getGoldenPrompt(sessionName, mode = 'generate', opts = {}) {
  const { strategy = 'product', postType = 'auto', platforms = [], count = 6 } = opts;
  const researchPath = path.join(__dirname, '../memory/research-data.md');
  const researchData = fs.existsSync(researchPath) ? fs.readFileSync(researchPath, 'utf8') : 'No research data available.';

  // Scan local images repository
  const localImgDir = path.join(__dirname, '../data/local-images');
  if (!fs.existsSync(localImgDir)) fs.mkdirSync(localImgDir, { recursive: true });
  const localImages = fs.readdirSync(localImgDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

  // Get recently used headlines to prevent duplicates
  const recentHeadlines = (db.run(`
    SELECT body, cta FROM posts 
    WHERE created_at >= datetime('now', '-24 hours')
  `) || []).map(p => (p.body||'').substring(0, 50) + '...' + (p.cta||'').substring(0, 50)).join('\n');

  if (mode === 'chat') {
    return `You are GLIDE, the Social Media Marketing Agent for PAPERLY. 
You are currently in a professional intelligence chat with your owner.
Respond in clean, insightful Markdown. 

## CURRENT CONTEXT:
${researchData}

## LOCAL ASSET REPOSITORY (AVAILABLE FOR SEARCH):
${localImages.join(', ')}

## YOUR BRAND VOICE:
Refer to GLIDEN_SKILL.md for your tone. Be sharp, efficient, and data-driven.`;
  }

  let strategyPrompt = '';
  if (strategy === 'growth') {
    strategyPrompt = `
## CURRENT STRATEGY: PERSONAL AUTHORITY GROWTH MODE
You are currently generating content to grow the founder's personal brand and authority.
- Priorities: Expertise visibility, trust, authority, human helpfulness.
- Specialized Post Type: ${postType === 'auto' ? 'Select the best fit from PERSONAL_GROWTH_SKILL.md' : postType}
- Refer to PERSONAL_GROWTH_SKILL.md for tone and structural rules.
- Platforms like LinkedIn and Reddit should strictly follow this mode.
`;
  } else {
    strategyPrompt = `
## CURRENT STRATEGY: PAPERLY PRODUCT MARKETING MODE
- Priorities: News-driven traffic to paperly.online, product awareness.
- Platforms: Facebook, Instagram, Twitter, TikTok.
`;
  }

  return `Generate high-quality social media posts for ${sessionName}.
${strategyPrompt}

## CRITICAL: PLATFORM MODES (DEFAULT)
- **Facebook / Instagram / Twitter / TikTok**: Usually "Paperly Product Marketing Mode".
- **LinkedIn / Reddit**: Usually "PERSONAL AUTHORITY GROWTH MODE".

${strategy === 'growth' ? '## OVERRIDE: All selected platforms should prioritze PERSONAL AUTHORITY branding but keep platform-specific nuances.' : ''}

## TARGET PLATFORMS:
${platforms.length > 0 ? platforms.join(', ') : '2 for Facebook, 2 for Instagram, 1 for LinkedIn, 1 for Reddit'}

## TOTAL POSTS TO GENERATE:
${count}

## CURRENT RESEARCH DATA (MANDATORY STORIES):
${researchData}

## CONTENT STRATEGY (HEADLINE-DRIVEN CLICKS)
1. **Headline Priority**: Actual headlines and briefings from Paperly's research are the "Main Event". 
2. **VERBATIM HEADLINE RULE (CRITICAL)**: You MUST use the exact headline string from the \`research-data.md\` (e.g., "Story 1: [Headline]") for the \`headline\` field in your visual content. Do NOT summarize or rephrase it.
3. **STORY ALIGNMENT RULE (CRITICAL)**: Your post body and slides must strictly adhere to the intelligence points provided in the research data. Do NOT add external context or hallucinate details.
4. **Goal**: Use the news story as the hook to drive traffic to the intelligence platform.
5. **Sales Post Limit**: Separate "Sales/Promotional" posts (general Paperly promos) are limited to exactly **2 PER WEEK TOTAL**.
6. **African/Nigerian Context**: Strong focus on local news and its impact on the reader.

## EXCLUSION LIST (RECENTLY POSTED - DO NOT REPEAT):
${recentHeadlines || 'No recent duplicates.'}

## LOCAL IMAGE REPOSITORY (PRIORITY #1):
Available files: ${localImages.length > 0 ? localImages.join(', ') : 'No local images yet.'}
- If a filename matches a keyword or topic from the news (e.g., 'tinubu.jpg', 'cbn.png'), you MUST use it. 
- Path format: /data/local-images/[filename]

## PROMOTIONAL GARNISH & CTAs (USE FOR CLICKS)
Use these primarily in the **cta** field or as a **side-note** to the news story:
- "Our pocket and your future. 🇳🇬"
- "One story. Three sides. Here's what's actually happening."
- "I read 50 articles so you don't have to. ⏳"
- "Be the smartest person in the room. Every time. 🧠"
- "What nobody is telling you about the news you read on WhatsApp."
- "50 articles condensed into this 60-second intel brief. Here is what matters today."

## MANDATORY CAROUSEL SEQUENCE
Every carousel MUST follow this slide order:
1. **Slide 1: Intel Brief (Cover)** — Use a strong hook/headline.
2. **Slide 2: Story 1** — Headline + Brief from research.
3. **Slide 3: Story 2** — Headline + Brief from research.
4. **Slide 4: Story 3** — Headline + Brief from research.
5. **Slide 5: Final CTA** — "Ready for the full brief? Link in bio" or story-specific link.

RULES:

## MANDATORY STORY URL MAPPING (USE THESE LINKS):
${researchData.split('\n').filter(l => l.startsWith('## Story') || l.startsWith('**URL**')).join('\n')}

RULES:
- TOPIC LINKING RULE (PRIMARY):
  - Every post focusing on a specific story MUST use the exact URL from that story's research data in the \`cta\`.
  - Generic links to "paperly.online" are strictly forbidden for story-specific posts.
  - If a carousel covers multiple stories, the main CTA can be generic, BUT individual story slides should mention the specific link if possible (in bullets).
- TOPIC LINKING RULE (CRITICAL):
  - Every post MUST include the specific \`topicURL\` for that story from your research data.
  - Do NOT link to the generic 'paperly.online' homepage if a \`topicURL\` exists for the story.
  - FAILURE to include the story-specific link is a compliance violation. The \`topicURL\` is found in each story block in your research data.
  - The \`topicURL\` MUST be placed in the \`cta\` field.

IMAGE SELECTION RULE (R2 GLIDEBUCKET ONLY):
You MUST always include a descriptive keyword or phrase in the image_url field. 
Do NOT generate full HTTP URLs (like Unsplash, Pixabay, etc.). 
The backend will automatically source matching high-quality assets from our internal Cloudflare R2 'glidebucket'.

1. 🏺 RELEVANCY (CRITICAL):
   → Provide a 3-5 word topic string in the image_url field (e.g., "Bola Tinubu Portrait", "Lagos Economy", "CBN Headquarters").
   → **STRICT MATCHING**: Our system now uses a high-confidence matching threshold. 
   → If you are not 100% sure a matching image exists in our repository for a story, you MUST leave the image_url field as "" (blank). 
   → **Wrong images are worse than no image.** 
   → If you leave image_url blank, the post will use a professional text-only design.

2. 📂 NO WEB FALLBACK:
   → Do NOT attempt to use external web search. Simply provide the most accurate keywords for the story.
   → If the story is extremely abstract (e.g., "General growth in Nigeria"), leave image_url as "".

NEVER use a placeholder like "camera.jpg" or a fake URL. Always use real topic keywords or blank.

Return ONLY the following JSON (no conversational text before or after):
\`\`\`json
{
  "action": "create_posts",
  "posts": [
    {
      "platform": "facebook",
      "hook": "Concise story hook...",
      "body": "Detailed summary from the specific story...",
      "cta": "Read the full intelligence brief: [topicURL from research]",
      "caption": "Creative social caption...",
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
          "image_url": "Lagos Economy" // Use specific keywords or "" if unsure
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
            { "type": "cover" },
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
            { "type": "cta" }
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

CRITICAL: Output exactly ${count} posts for the requested platforms. Use REAL story-relevant image URLs. Ensure valid JSON. Output ONLY JSON.`;
}

// Temporary test endpoint for Phase 4 verification
app.get('/api/test-session', async (req, res) => {
  try {
    await runSession('SharpStyleSim');
    res.json({ success: true, message: 'Sharp session simulation complete. Check logs and posts.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate content via GLIDE
app.post('/api/generate', async (req, res) => {
  const { platforms, count = 6, theme, strategy, postType } = req.body;
  
  try {
    console.log('🔍 Refreshing intelligence from Paperly.online...');
    await runResearch();
  } catch (err) {
    console.error('⚠️ Research fetch failed:', err.message);
  }

  const prompt = getGoldenPrompt('Manual Dashboard', 'generate', { strategy, postType, platforms, count });
  try {
    const rawResponse = await chatWithGlide(prompt, 'generate');
    const response = await processAgentResponse(rawResponse);
    res.json({ response, message: 'Content generation complete. Check drafts.' });
  } catch (err) {
    console.error('[Generate API] Error:', err.message);
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
      case 'linkedin':
        platformPostId = await postToLinkedIn(post);
        break;
      case 'reddit':
        platformPostId = await postToReddit(post);
        break;
      default:
        throw new Error(`Unsupported platform: ${post.platform}`);
    }

    console.log(`✅ [Post ${post.id}] API success. Platform ID: ${platformPostId}`);

    // Refactored to single line string to avoid multi-line query issues with sqlite-sync
    const query = "UPDATE posts SET status = 'posted', platform_post_id = ?, posted_at = (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) WHERE id = ?";
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
    db.run('INSERT INTO errors (message, stack, created_at) VALUES (?, ?, (strftime(\'%Y-%m-%dT%H:%M:%SZ\', \'now\')))', 
      [`Post ${post.id} Error (${post.platform}): ${err.message}`, err.stack]);
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
  
  // 1. Refresh Research
  try {
    console.log(`🔍 [${sessionName}] Refreshing news research...`);
    await runResearch();
  } catch (err) {
    console.error(`⚠️ [${sessionName}] Research failed, using existing memory:`, err.message);
  }

  // 2. Generate Content
  const prompt = getGoldenPrompt(sessionName, 'generate');
  console.log(`🤖 [${sessionName}] Starting generation session...`);
  const rawResponse = await chatWithGlide(prompt, 'generate');
  const result = await processAgentResponse(rawResponse);
}

// AUTOMATED CYCLE: Every 5 hours (12am, 5am, 10am, 3pm, 8pm)
cron.schedule('0 */5 * * *', () => runSession('AutoSession'));

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

module.exports = { app, db, chatWithGlide, sendWhatsApp, postContent, handleStructuredAgentResponse, getGoldenPrompt, processAgentResponse, ensureLocalImage, runResearch };
