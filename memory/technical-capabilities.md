## Content Hosting & Posting Strategy
- **Official Provider**: Cloudflare R2
- **Hybrid Flow**:
  - **Facebook (Single Post)**: Prefers binary upload from the local `data/output` directory for maximum performance and reach.
  - **Instagram & TikTok**: Uses Cloudflare R2 public URLs as it's the only reliable method for these platforms.
  - **Facebook (Carousel)**: Falls back to R2 URLs for multi-image stability.
- **Workflow**: 
  1. GLIDE generates content.
  2. Server renders HTML templates to local PNG/MP4.
  3. Server uploads to Cloudflare R2.
  4. Platform modules pick the best asset type (Local Binary or R2 URL) based on the target platform.

## Social Media Integration
- **TikTok**: Uses `PULL_FROM_URL` with R2 assets.
- **Instagram**: Uses `image_url` or `video_url` pointing to R2 assets.
- **Facebook**: Uses both binary uploads and public R2 URLs for carousels.
- **X (Twitter)**: Standard media upload flow.

## Developer Note
- Always ensure `visual_assets` contains valid public URLs when preparing posts for TikTok and Instagram.
- If a post fails, check R2 connectivity via `tests/test_r2_upload.js`.
