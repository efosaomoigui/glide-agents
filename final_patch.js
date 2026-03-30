const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'server/index.js');
let content = fs.readFileSync(filepath, 'utf8');

// 1. Fix Carousel Data Transformation
const oldCarousel = `              } else if (post.visual_content.template_type === 'carousel') {
                const renderData = { ...post.visual_content.data, format: post.visual_content.format || 'square' };
                const filenames = await renderer.renderCarousel(renderData, post.visual_content.version || 1);
                assetPaths = filenames.map(f => \`/output/\${f}\`);
              }`;

const newCarousel = `              } else if (post.visual_content.template_type === 'carousel') {
                // ADAPTATION: Handle both {slides} and simple array
                let rData = post.visual_content.data || {};
                if (Array.isArray(rData)) {
                  rData = {
                    slides: [
                      { type: 'cover', title: post.hook || '', desc: post.body || '' },
                      ...rData.map(item => ({ 
                        type: 'story', 
                        title: item.headline || item.title || '', 
                        desc: item.summary || item.desc || '' 
                      }))
                    ]
                  };
                }
                const filenames = await renderer.renderCarousel(rData, post.visual_content.version || 1);
                assetPaths = filenames.map(f => \`/output/\${f}\`);
              }`;

if (content.indexOf(oldCarousel) !== -1) {
    content = content.replace(oldCarousel, newCarousel);
    console.log('✅ Carousel rendered fix applied.');
} else {
    console.log('❌ Carousel pattern not found. The string might be slightly different.');
}

// 2. Ensure status: 'draft' is forced
const oldStatus = "status: autoPost ? 'approved' : 'draft',";
const newStatus = "status: 'draft', // Forced for dashboard visibility";

if (content.indexOf(oldStatus) !== -1) {
    content = content.replace(oldStatus, newStatus);
    console.log('✅ Status forced to draft.');
} else {
    console.log('❌ Status pattern not found (might already be patched).');
}

fs.writeFileSync(filepath, content, 'utf8');
console.log('Done.');
