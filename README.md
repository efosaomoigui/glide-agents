# GLIDE — Social Marketing Agent for PAPERLY

**Your automated social media marketing machine for TikTok, Facebook, Instagram & X.**

---

## Quick Start (5 commands)

```bash
# 1. Install dependencies
npm install

# 2. Copy and fill in your API keys
cp .env.example .env
# → Open .env in a text editor and fill in your keys (see Setup Guide)

# 3. Start GLIDE server
npm start

# 4. (In a new terminal) Start the admin dashboard
cd dashboard && npm install && npm run dev

# 5. Open the dashboard
# → http://localhost:3000

# GLIDE will WhatsApp you when it's online!
```

---

## Talk to GLIDE on WhatsApp

Once running, send any of these to your configured WhatsApp number:

| Command | What Happens |
|---------|-------------|
| `status` | Performance snapshot |
| `Morning brief` | Yesterday's analytics + today's plan |
| `Create this week's content` | Generates 7 days of posts for all platforms |
| `What's working?` | Best performers + analysis |
| `Pause` | Stops all posting |
| `Resume` | Restarts posting |
| `Analyse TikTok` | Deep dive into TikTok performance |
| `New hook idea: [your idea]` | GLIDE tests and adds to hook library |

Or just talk naturally:
> "I want to focus on Nigerian SME owners this week. Create 3 TikToks about how PAPERLY saves time on monthly reporting."

---

## File Structure

```
glide-agent/
├── GLIDEN_SKILL.md          ← Edit this with your product details
├── .env                     ← Your API keys (create from .env.example)
├── server/
│   ├── index.js             ← Main server
│   ├── social/              ← Platform connectors
│   └── analytics/           ← Analytics collection
├── memory/                  ← GLIDE's brain (auto-updated)
│   ├── performance-history.md
│   ├── hook-library.md
│   ├── brand-voice.md
│   └── audience-insights.md
└── data/
    └── paperly.db            ← Auto-created SQLite database
```

---

## The GLIDE Loop

```
RESEARCH → CREATE → POST → ANALYSE → ITERATE → REPEAT
```

GLIDE runs this loop automatically. Your only daily task:
- **TikTok:** Open draft → add sound → tap post (30 seconds)
- **Everything else:** GLIDE posts automatically

---

## Full Setup Guide

See **GLIDE_Setup_Guide.docx** for the complete step-by-step installation instructions including all API setup, WhatsApp configuration, and platform connections.

---

*Built for PAPERLY | GLIDE Agent v1.0*
"# glide-agent" 
