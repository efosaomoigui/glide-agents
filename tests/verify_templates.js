const renderer = require('../server/render/renderer');

async function testAllTemplates() {
  const data = {
    headline: 'The $250k Loan Dismissal',
    summary: 'Court strikes out Dajo Oil suit against bank over alleged debt miscalculation and illegal charges.',
    sector: 'LEGAL',
    sources: 'GLIDE Intelligence',
    format: 'square'
  };

  for (const v of ['1', '2', '3']) {
    console.log(`🎨 Rendering template v${v}...`);
    // I will temporarily modify renderer.js in Docker to allow testing the version parameter
    const filename = await renderer.renderSinglePost(data, v);
    console.log(`✅ Render v${v} complete: ${filename}`);
  }
  process.exit(0);
}

testAllTemplates().catch(err => {
  console.error(err);
  process.exit(1);
});
