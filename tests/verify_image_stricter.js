const { getRandomImageFromBucket } = require('../server/social/r2');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function verifyStricterMatching() {
    console.log('🚀 Verifying Stricter Image Matching Logic...');

    const testCases = [
        {
            name: "Weak Match (Generic Keywords)",
            keyword: "Naira holds firm at N1,844/£1 against a resilient British pound.",
            expected: null // Should be null because "holds", "firm", "against" are stop words, and "naira" alone is only 1.5-2.0 if file is named naira.png
        },
        {
            name: "Strong Match (Multiple Specific Keywords)",
            keyword: "Naira exchange rate volatility",
            expected: "should match if file has naira and exchange or rate"
        },
        {
            name: "Exact Match (Specific Keyword)",
            keyword: "Bola Tinubu Portrait",
            expected: "should match if file has tinubu and portrait"
        }
    ];

    for (const test of testCases) {
        console.log(`\n--- Test: ${test.name} ---`);
        console.log(`Keyword: "${test.keyword}"`);
        try {
            const result = await getRandomImageFromBucket(test.keyword);
            console.log(`Result: ${result || 'NULL (Success: Filtered weak match)'}`);
            
            if (test.name === "Weak Match (Generic Keywords)") {
                if (result && result.includes('convocation')) {
                    console.error('❌ FAILED: Still matching University of Calabar convocation image!');
                } else if (result === null) {
                    console.log('✅ PASSED: Correctly filtered out weak/unrelated matches.');
                }
            }
        } catch (err) {
            console.error('❌ Error during test:', err.message);
        }
    }
}

verifyStricterMatching();
