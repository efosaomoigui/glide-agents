const renderer = require('./server/render/renderer');

async function testRandom() {
  console.log('🎲 Testing Random Template Selection...');
  const data = { headline: 'RANDOM TEST', summary: 'Testing random selection', sector: 'General', image_url: 'https://images.unsplash.com/photo-1541873676947-9c6020d26824' };
  
  // No version specified
  const name1 = await renderer.renderSinglePost(data);
  const name2 = await renderer.renderSinglePost(data);
  const name3 = await renderer.renderSinglePost(data);
  
  console.log(`✅ Rendered 3 posts. Check filenames (they use the same template if random picked the same one, but over time they vary):`);
  console.log(` - ${name1}\n - ${name2}\n - ${name3}`);
}

testRandom();
