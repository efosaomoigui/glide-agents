const renderer = require('./server/render/renderer');

async function test() {
  console.log('🖼️  Testing dynamic image replacement...');
  
  // Use a clearly identifiable non-camera image to prove the replacement works
  const data = {
    headline: 'MIDNIGHT RESCUE IN AKURE',
    summary: 'How Amotekun intercepted gunmen after a 2:00 AM health centre raid.',
    sector: 'Security',
    sources: 'Punch · The Nation',
    // Bright city/urban image — very different from the dark camera placeholder
    image_url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1080&q=85'
  };

  try {
    // Test with v1 explicitly so we know which template
    const filename = await renderer.renderSinglePost(data, '1');
    console.log(`✅ Done! Output: data/output/${filename}`);
    console.log('   Open the PNG — you should see a CITY/PEOPLE image, NOT a camera.');
  } catch (err) {
    console.error('❌ Failed:', err.message);
  }
}

test();
