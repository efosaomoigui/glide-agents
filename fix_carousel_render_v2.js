const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, 'server/index.js');
let content = fs.readFileSync(filepath, 'utf8');

const oldCode = `              } else if (post.visual_content.template_type === 'carousel') {
                const renderData = { ...post.visual_content.data, format: post.visual_content.format || 'square' };
                const filenames = await renderer.renderCarousel(renderData, post.visual_content.version || 1);
                assetPaths = filenames.map(f => \`/output/\${f}\`);
              }`;

const newCode = `              } else if (post.visual_content.template_type === 'carousel') {
                // ADAPTATION: Handle both {slides} and simple array from AI
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

if (content.indexOf(oldCode) !== -1) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(filepath, content, 'utf8');
  console.log('✅ Carousel rendered fix applied successfully.');
} else {
  console.log('❌ Pattern not found for replacement.');
}
