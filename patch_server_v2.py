import codecs
import os

filepath = 'server/index.js'
with codecs.open(filepath, 'r', 'utf-8') as f:
    content = f.read()

# 1. Transform Carousel Data to be robust
old_carousel = """              } else if (post.visual_content.template_type === 'carousel') {
                const renderData = { ...post.visual_content.data, format: post.visual_content.format || 'square' };
                const filenames = await renderer.renderCarousel(renderData, post.visual_content.version || 1);
                assetPaths = filenames.map(f => `/output/${f}`);
              }"""

new_carousel = """              } else if (post.visual_content.template_type === 'carousel') {
                // ADAPTATION: Handle both {slides} and simple array
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

# 2. Force Draft Status for visibility
old_status = "status: autoPost ? 'approved' : 'draft',"
new_status = "status: 'draft', // Forced"

if old_carousel in content:
    content = content.replace(old_carousel, new_carousel)
    print('Carousel fixed')
else:
    print('Carousel pattern NOT found')

if old_status in content:
    content = content.replace(old_status, new_status)
    print('Status fixed')
else:
    print('Status pattern NOT found')

with codecs.open(filepath, 'w', 'utf-8') as f:
    f.write(content)
