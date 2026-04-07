const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

/**
 * Visual Renderer for GLIDE
 * Converts HTML templates to professional PNG assets.
 *
 * Design principle:
 * - Templates are rendered at their NATIVE CSS size — no forced scaling.
 * - deviceScaleFactor: 2 provides 2x high-DPI output (retina quality).
 * - Dynamic images + fonts are always waited on before screenshotting.
 * - When user redesigns templates to 1080px native, they render at 1080px.
 */
class VisualRenderer {
  constructor() {
    this.templateDir = path.join(__dirname, '../../assets');
    this.outputDir = path.join(__dirname, '../../data/output');
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  getBrowserPath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  getLaunchArgs() {
    return [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',           // Allow file:// pages to load Unsplash/web images
      '--allow-file-access-from-files',   // Cross-origin from file:// URLs
      '--disable-features=IsolateOrigins,site-per-process',
      '--font-render-hinting=none'        // Consistent font rendering in headless
    ];
  }

  /**
   * Waits for ALL images AND fonts to fully load before screenshotting.
   * Both are critical — images need network fetch, fonts need @import resolution.
   */
  async waitForAssetsLoaded(page) {
    // 1. Wait for all <img> elements to load
    await page.evaluate(() => {
      const images = Array.from(document.images);
      return Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
          });
        })
      );
    });

    // 2. Wait for fonts to be ready (document.fonts.ready API)
    await page.evaluate(() => document.fonts.ready);

    // 3. Final render settle buffer
    await new Promise(r => setTimeout(r, 500));
  }

  /**
   * Renders a single post template to PNG.
   * Captures the .post element at its native template size @ 2x DPI.
   */
  async renderSinglePost(data, version = null) {
    const randomVersion = Math.floor(Math.random() * 3) + 1;
    const selectedVersion = version || data.version || String(randomVersion);
    const templatePath = path.join(this.templateDir, `singlepost/paperly-post-image-v${selectedVersion}.html`);
    if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);

    const executablePath = this.getBrowserPath();
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: executablePath || undefined,
      args: this.getLaunchArgs()
    });
    const page = await browser.newPage();

    // Large viewport so template has room to render at full size
    await page.setViewport({ width: 1200, height: 1400, deviceScaleFactor: 2 });

    // Load template — network idle ensures Google Fonts @import is resolved
    await page.goto(`file://${templatePath}`, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {
      // Fallback if network idle times out (e.g. offline) — just wait for DOM
    });

    // Inject dynamic content
    await page.evaluate((content) => {
      console.log('💉 Injecting content:', { headline: content.headline, image: content.image_url });
      
      // Inject dynamic background image
      if (content.image_url) {
        const img = document.querySelector('.post-img');
        if (img) {
          img.src = content.image_url;
          img.onerror = () => console.error('❌ Failed to load image:', content.image_url);
          img.onload = () => console.log('✅ Image loaded successfully:', content.image_url);
        }
      }

      // Inject text content
      const q = (sel) => document.querySelector(sel);
      if (content.headline && q('.headline'))    q('.headline').innerHTML = content.headline;
      if (content.summary  && q('.summary p'))  q('.summary p').innerHTML = content.summary;

      // Sector badge — preserve the live dot
      if (content.sector) {
        const sectorEl = q('.sector') || q('.sector-tag') || q('.sector-badge');
        if (sectorEl) {
          const dot = sectorEl.querySelector('.live-dot') || sectorEl.querySelector('.live-pip');
          sectorEl.textContent = content.sector;
          if (dot) sectorEl.prepend(dot);
        }
      }

      // Sources
      if (content.sources) {
        const src = q('.footer-src') || q('.story-meta');
        if (src) src.textContent = content.sources;
      }
    }, data);

    // Capture console messages from Puppeteer context to node console
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('✅') || text.includes('❌')) console.log(`   [Browser] ${text}`);
    });

    // Wait for image fetch + font load + paint
    await this.waitForAssetsLoaded(page);

    const filename = `post_${Date.now()}.png`;
    const outputPath = path.join(this.outputDir, filename);

    // Screenshot the .post element specifically (not full page)
    const element = await page.$('.post');
    if (!element) throw new Error('No .post element found in template');
    await element.screenshot({ path: outputPath });

    await browser.close();
    return filename;
  }

  /**
   * Renders a carousel template — each slide becomes a separate PNG.
   * Template renders at its native CSS size; deviceScaleFactor provides quality.
   */
  async renderCarousel(data, version = null) {
    const randomVersion = Math.floor(Math.random() * 3) + 1;
    const selectedVersion = version || data.version || String(randomVersion);
    const templatePath = path.join(this.templateDir, `carousel-reels/paperly-carousel-v${selectedVersion}.html`);
    if (!fs.existsSync(templatePath)) throw new Error(`Template not found: ${templatePath}`);

    const executablePath = this.getBrowserPath();
    const browser = await puppeteer.launch({
      headless: 'new',
      executablePath: executablePath || undefined,
      args: this.getLaunchArgs()
    });
    const page = await browser.newPage();

    // Large viewport — let the template control the actual slide size via CSS (540px × 2x DPI = 1080px output)
    await page.setViewport({ width: 1200, height: 1400, deviceScaleFactor: 2 });

    await page.goto(`file://${templatePath}`, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

    // Inject all slide data
    await page.evaluate((content) => {
      const slides = Array.isArray(content.slides) ? content.slides : [];

      // 1. Cover slide
      const cover = slides.find(s => s.type === 'cover');
      if (cover) {
        const titleEl = document.querySelector('.cover-title');
        const descEl  = document.querySelector('.cover-sub') || document.querySelector('.cover-desc');
        if (titleEl && cover.title) titleEl.innerHTML = cover.title;
        if (descEl  && cover.desc)  descEl.innerHTML  = cover.desc;
      }

      // 2. Story slides
      const stories    = slides.filter(s => s.type === 'story');
      const storySlides = document.querySelectorAll('.s-story');

      stories.forEach((story, i) => {
        const slide = storySlides[i];
        if (!slide) return;

        // Background image — inject into .slide-img if present, otherwise CSS background
        if (story.image_url) {
          const img = slide.querySelector('.slide-img');
          if (img) {
            img.src = story.image_url;
          } else {
            // Fallback: overlay image as CSS background on the slide itself
            slide.style.backgroundImage    = `url(${story.image_url})`;
            slide.style.backgroundSize     = 'cover';
            slide.style.backgroundPosition = 'center';
            slide.style.backgroundRepeat   = 'no-repeat';
          }
        }

        // Sector badge
        const badge = slide.querySelector('.sector-badge') || slide.querySelector('.sector-tag');
        if (badge && story.sector) {
          const dot = badge.querySelector('.dot-live') || badge.querySelector('.live-pip');
          badge.textContent = story.sector;
          if (dot) badge.prepend(dot);
        }

        // Headline
        const headline = slide.querySelector('.headline');
        if (headline && story.headline) headline.innerHTML = story.headline;

        // Bullets — clone the template's own first bullet as a pattern, then replace text
        const bulletContainer = slide.querySelector('.bullets');
        if (bulletContainer && story.bullets && story.bullets.length > 0) {
          // Grab the template's own existing bullet element as a pattern clone
          const existingBullets = bulletContainer.querySelectorAll('.bullet');
          const templateBullet = existingBullets.length > 0 ? existingBullets[0].cloneNode(true) : null;

          if (templateBullet) {
            bulletContainer.innerHTML = '';
            story.bullets.forEach(txt => {
              const clone = templateBullet.cloneNode(true);
              // Find the text-holding span — could be .bull-text, .bull-text, p, or last span
              const textEl = clone.querySelector('.bull-text') || clone.querySelector('span:last-child') || clone.querySelector('p');
              if (textEl) textEl.textContent = txt;
              bulletContainer.appendChild(clone);
            });
          } else {
            // Absolute fallback: plain divs
            bulletContainer.innerHTML = '';
            story.bullets.forEach(txt => {
              const div = document.createElement('div');
              div.className = 'bullet';
              div.innerHTML = `<div class="bull-mark"></div><span class="bull-text">${txt}</span>`;
              bulletContainer.appendChild(div);
            });
          }
        }
      });

      // 3. CTA slide
      const cta = slides.find(s => s.type === 'cta');
      if (cta) {
        const ctaHead = document.querySelector('.cta-headline');
        const ctaSub  = document.querySelector('.cta-sub');
        if (ctaHead && cta.headline) ctaHead.innerHTML = cta.headline;
        if (ctaSub  && cta.sub)      ctaSub.innerHTML  = cta.sub;
      }
    }, data);

    // Wait for all images + fonts before any screenshots
    await this.waitForAssetsLoaded(page);

    // Screenshot each slide one at a time
    const paths = [];
    const numSlides = data.slides.length;

    for (let i = 0; i < numSlides; i++) {
      // Navigate carousel to the right slide
      await page.evaluate((index) => {
        if (typeof goTo === 'function') goTo(index);
      }, i);

      // Allow transition to complete
      await new Promise(r => setTimeout(r, 700));

      const filename  = `carousel_${Date.now()}_${i}.png`;
      const outputPath = path.join(this.outputDir, filename);

      // Capture .viewport (the slide window), not the entire page
      const viewport = await page.$('.viewport');
      if (viewport) {
        await viewport.screenshot({ path: outputPath });
      }
      paths.push(filename);
    }

    await browser.close();
    return paths;
  }
}

module.exports = new VisualRenderer();
