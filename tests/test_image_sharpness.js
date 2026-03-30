const renderer = require('../server/render/renderer');
const path = require('path');
const fs = require('fs');

async function test() {
  console.log('Generating test image for sharpness validation...');
  try {
    const data = {
      headline: "The $250k Loan Dismissal",
      summary: "Court strikes out Dajo Oil suit against bank over alleged debt miscalculation and illegal charges.",
      sector: "LEGAL",
      sources: "GLIDE Intelligence",
      format: "square"
    };

    const filename = await renderer.renderSinglePost(data, 1);
    const fullPath = path.join(__dirname, '../data/output', filename);
    
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      console.log(`✅ Success! Test image generated: ${filename}`);
      console.log(`📏 File size: ${stats.size} bytes`);
      console.log(`📍 Path: ${fullPath}`);
    } else {
      console.error('❌ Failed! Image file not found after render.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error during render test:', err);
    process.exit(1);
  }
}

test();
