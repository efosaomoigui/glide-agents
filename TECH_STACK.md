# GLIDE — Technical Stack & Architecture Documentation

This document outlines the technologies, tools, and "wiring" that power the GLIDE Social Marketing Agent.

## 🧠 The Brain: Agentic Orchestration

### Claude Code (OpenClaw)
The project core is built on **Claude Code**, referred to internally as **OpenClaw**. This is the orchestration layer that allows the AI to think, research, and execute commands within the project environment.

- **Skill Definition**: `GLIDEN_SKILL.md` acts as the "system prompt" and operating manual. It defines the agent's identity, brand voice (Paperly), and strict execution rules.
- **Memory System**: A collection of Markdown files in `/memory/` (e.g., `performance-history.md`, `brand-voice.md`) that provides the agent with persistent context across sessions.

### LLM Providers
GLIDE uses a dual-provider strategy for maximum reliability:
1. **Primary**: Anthropic Claude 3.5 Sonnet (via `@anthropic-ai/sdk`).
2. **Fallback**: Google Gemini 2.0 Flash (via `@google/generative-ai`) for high-speed tasks or if Claude is unavailable.

---

## ⚙️ Backend: The Engine Room

### Core Runtime
- **Node.js & Express**: Handles the REST API, webhooks, and task orchestration.
- **SQLite**: Local database (`data/paperly.db`) used for:
  - Post queue management (Drafts vs. Posted).
  - Analytics history.
  - Conversation logs.
  - System settings and error tracking.

### The Rendering Pipeline (`server/render/`)
GLIDE generates professional-grade visual assets dynamically:
- **Puppeteer-core**: Runs a headless browser to "print" social media posts.
- **HTML/CSS Templates**: Located in `/assets/`. These are "living" designs that Puppeteer injects with real data (headlines, bullets, images) before taking a high-DPI (2x scale) screenshot.
- **Cloudflare R2**: All rendered assets are uploaded to Cloudflare R2 (using `@aws-sdk/client-s3`) to provide public CDN URLs for social media platforms.

---

## 🛠️ Connectivity & Wiring

### 1. The Interaction Loop
Users interact with GLIDE through three primary channels:
- **WhatsApp**: Integrated via **Twilio API** (connected to the `/webhook/whatsapp` endpoint).
- **Telegram**: Integrated via **Telegram Bot API** (Long polling).
- **Admin Dashboard**: A custom web UI for queue management and analytics visualization.

### 2. Social Media Integration (`server/social/`)
Direct API connections are established for:
- **Facebook & Instagram**: Meta Graph API.
- **X (Twitter)**: Twitter API v2.
- **TikTok**: TikTok Content Posting API.

### 3. The "Intelligence" Workflow
The system is "wired" to follow a continuous loop:
1. **Research**: `research.js` scrapes/processes news data into `memory/research-data.md`.
2. **Decision**: The Agent (Claude) reads the research and decides on the day's content mix.
3. **Creation**: The Agent outputs a `create_posts` JSON block.
4. **Execution**: The server saves drafts, triggers Puppeteer to render images, and uploads them to R2.
5. **Analytics**: A cron job (`node-cron`) periodically triggers `analytics/collector.js` to fetch metrics and update the "Performance History" memory.

---

## 📂 Project Structure Snapshot

```text
/
├── GLIDEN_SKILL.md          # Agent identity & rules
├── server/
│   ├── index.js             # API & Orchestration
│   ├── research.js          # Intelligence gathering
│   ├── render/              # Puppeteer rendering logic
│   └── social/              # Platform API connectors
├── dashboard/               # Admin UI
├── assets/                  # HTML/CSS Design Templates
├── memory/                  # Persistent Markdown context
└── data/
    ├── paperly.db           # SQLite Database
    └── local-images/        # Source image repository
```

## 🚀 Infrastructure
- **Docker**: The entire stack is containerized for easy deployment via `docker-compose`.
- **Environment Variables**: Managed via `.env` (API keys, R2 credentials, DB paths).

---
*Last Updated: April 2026*
