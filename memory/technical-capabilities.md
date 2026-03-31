# GLIDE Technical Capabilities — PAPERLY
## Architecture and Operations Guide (v2.0.0)

---

## CORE ARCHITECTURE (SQLite)

GLIDE operates on a persistent SQLite database located at:
`./data/paperly.db`

### Primary Tables & Schema

#### 1. `posts`
- `id` (int)
- `platform` (string): facebook, instagram, tiktok, twitter
- `hook` (text)
- `body` (text)
- `cta` (text)
- `image_prompts` (json)
- `visual_assets` (json)
- `caption` (text)
- `hashtags` (json)
- `status` (string): draft, queued, posted, failed
- `scheduled_for` (datetime)
- `created_at` (datetime)

#### 2. `analytics`
- `post_id` (int)
- `platform` (string)
- `views`, `likes`, `comments`, `shares`, `clicks` (int)
- `recorded_at` (datetime)

#### 3. `hooks`
- `text` (text): The hook content
- `platform` (string)
- `avg_views` (int)
- `usage_count` (int)
- `last_used` (datetime)

---

## CONTENT ASSET FLOW

1.  **GLIDE Generates Content:** Based on `paperly.online` research data.
2.  **HTML/CSS Rendering:** The server renders templates with GLIDE data into PNG (Single Post) or Slides (Carousel).
3.  **Cloudflare R2 Upload:** All rendered assets are uploaded to Cloudflare R2 for public access.
4.  **Platform Integration:**
    - **Facebook (Single Post):** Prefers binary upload from local `data/output`.
    - **Instagram, TikTok, FB Carousel:** Uses R2 Public URLs for stability.
    - **X (Twitter):** Standard media upload flow.

---

## AUTHORIZED SYSTEM ACTIONS

GLIDE has authority to execute the following actions:

- **`create_posts`** → Prepare and queue new content.
- **`clear_posts`** → Wipe all drafts or scheduled posts for a reset.
- **`clear_analytics`** → Reset performance tracking data.
- **`inspect_db`** → Review post history, analytics quality, and repetitive hooks.
- **`cleanup_duplicates`** → Identify and remove redundant content entries.

---

## MAINTENANCE & HEALTH AUTHORITY

As a Growth Operator, GLIDE is authorized to:
- Review and recommend database cleanup actions.
- Identify and improve underperforming prompt logic.
- Log system modifications and content improvements in `memory/maintenance-logs.md`.
- Escalate platform API failures or posting errors to the owner.

---

## DEVELOPER NOTES

- Ensure `visual_assets` contains valid public URLs before TikTok/Instagram posting.
- Check R2 connectivity if uploads fail: `tests/test_r2_upload.js`.
- Always validate content uniqueness before final queueing.
