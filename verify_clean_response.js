const { processAgentResponse } = require('./server/index.js');

async function verifyCleanResponse() {
    console.log('🚀 Verifying Robust JSON Processing & Clean Display...');
    
    // Test 1: Boilerplate + Valid JSON
    console.log('\n--- Test 1: Boilerplate "GLIDE" + JSON ---');
    const input1 = `GLIDE\n{ "action": "create_posts", "posts": [{"platform":"facebook"}] }`;
    const result1 = await processAgentResponse(input1);
    console.log('Result 1:', result1);
    if (result1.includes('Success!') && !result1.includes('facebook')) {
        console.log('✅ PASS: Boilerplate stripped and replaced with summary.');
    } else {
        console.log('❌ FAIL: JSON or boilerplate still visible.');
    }
    
    // Test 2: Malformed JSON (Trailing Comma)
    console.log('\n--- Test 2: Malformed JSON (Trailing Comma) ---');
    const input2 = `{ "action": "create_posts", "posts": [{"platform":"fb"},] }`;
    const result2 = await processAgentResponse(input2);
    console.log('Result 2:', result2);
    if (result2.includes('Success!')) {
        console.log('✅ PASS: Malformed JSON successfully parsed and cleaned.');
    } else {
        console.log('❌ FAIL: Parse error or JSON still visible.');
    }
}

verifyCleanResponse().catch(console.error);
