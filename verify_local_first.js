const path = require('path');
const fs = require('fs');
const { ensureLocalImage } = require('./server/index.js');

async function verifyLocalFirst() {
    console.log('🚀 Verifying Local-First Image Strategy...');
    
    // The directory is data/local-images
    // We know '1775015091448-peter obi.webp' exists there.
    
    const topic = 'Latest news on Peter Obi and the LP';
    console.log(`🔍 Searching for topic: "${topic}"`);
    
    const result = await ensureLocalImage('https://some-web-url.com/random.jpg', topic);
    
    console.log('📝 Result:', result);
    
    if (result.includes('peter obi') && result.startsWith('/local-images/')) {
        console.log('✅ SUCCESS: Local match found and prioritized over web URL!');
    } else {
        console.log('❌ FAILURE: Local match not found or incorrect path returned.');
    }
}

verifyLocalFirst().catch(console.error);
