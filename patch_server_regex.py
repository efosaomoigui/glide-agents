import codecs
import re

filepath = 'server/index.js'
with codecs.open(filepath, 'r', 'utf-8') as f:
    content = f.read()

# 1. Transform Carousels using regex
# Look for: } else if (post.visual_content.template_type === 'carousel') { ... filenames = await renderer.renderCarousel(renderData, ...); ... }
pattern = r"\}\s*else\s*if\s*\(\s*post\.visual_content\.template_type\s*===\s*'carousel'\s*\)\s*\{([\s\S]*?)await\s*renderer\.renderCarousel\([\s\S]*?\)\s*;\s*assetPaths\s*=\s*filenames\.map\([\s\S]*?\)\s*;\s*\}"

replacement = """} else if (post.visual_content.template_type === 'carousel') {
                let rData = post.visual_content.data || {};
                if (Array.isArray(rData)) {
                  rData = {
                    slides: [
                      { type: 'cover', title: post.hook, desc: post.body },
                      ...rData.map(item => ({ 
                        type: 'story', 
                        title: item.headline || item.title || '', 
                        desc: item.summary || item.desc || '' 
                      }))
                    ]
                  };
                }
                const filenames = await renderer.renderCarousel(rData, post.visual_content.version || 1);
                assetPaths = filenames.map(f => `/output/${f}`);
              }"""

if re.search(pattern, content):
    content = re.sub(pattern, replacement, content)
    print('✅ Carousel fix applied via regex.')
else:
    print('❌ Carousel pattern NOT found via regex!')

with codecs.open(filepath, 'w', 'utf-8') as f:
    f.write(content)
