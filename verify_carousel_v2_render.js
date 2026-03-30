const renderer = require('./server/render/renderer');
const path = require('path');
const fs = require('fs');

async function test() {
  console.log('🚀 Testing Dynamic Carousel Image Rendering (Version 2 - Magazine)...');
  
  const testData = {
    platform: 'facebook',
    template_type: 'carousel',
    version: '2', 
    data: {
      slides: [
        { type: 'cover', title: 'WHITE MAGAZINE', desc: 'Testing version 2' },
        { 
          type: 'story', 
          headline: 'STORY 1 (V2)', 
          sector: 'Security', 
          bullets: ['Point 1'],
          image_url: 'https://images.unsplash.com/photo-1541873676947-9c6020d26824?q=80&w=1080'
        },
        { type: 'cta', headline: 'READ MORE', sub: 'paperly.online' }
      ]
    }
  };

  try {
    const filenames = await renderer.renderCarousel(testData.data, testData.version);
    console.log(`✅ Success! Rendered ${filenames.length} slides.`);
  } catch (err) {
    console.error('❌ Render failed:', err);
  }
}

test();
