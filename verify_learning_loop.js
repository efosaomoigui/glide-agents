const path = require('path');
const fs = require('fs');
// We need to mock the environment for ensureLocalImage
const { ensureLocalImage } = require('./server/index.js');

async function verifyLearningLoop() {
    console.log('🚀 Verifying Image Learning Loop (Stamping)...');
    
    const testTopic = 'Verification Testing of Stamping Logic';
    const testUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Bola_Tinubu.jpg/220px-Bola_Tinubu.jpg';
    
    // 1. Initial call - should stamp
    console.log('--- Step 1: Initial web source call ---');
    const result1 = await ensureLocalImage(testUrl, testTopic);
    console.log('Result 1:', result1);
    
    if (result1.startsWith('/local-images/stamped-verification-testing')) {
        console.log('✅ SUCCESS: Web image was stamped locally.');
    } else {
        console.log('❌ FAILURE: Web image was not stamped.');
    }
    
    // 2. Second call - should find local
    console.log('\n--- Step 2: Second call with keywords ---');
    const result2 = await ensureLocalImage('https://different-url.com/ignore.jpg', 'News about Verification Testing');
    console.log('Result 2:', result2);
    
    if (result2 === result1) {
        console.log('✅ SUCCESS: Local match was found on subsequent call! (Learning loop confirmed)');
    } else {
        console.log('❌ FAILURE: Local match was not found.');
    }
    
    // Cleanup - we don't want to pollute the repo with test stamps
    const fullPath = path.join(__dirname, 'data', result1);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
        console.log('\n🗑️ Test asset cleaned up.');
    }
}

verifyLearningLoop().catch(console.error);
