const { processAgentResponse } = require('./server/index.js');

async function verifyComponentResponse() {
    console.log('🚀 Verifying Component-Driven Response Logic...');
    
    // Input: A message that triggers an action
    const input = `GLIDE\n{ "action": "create_posts", "posts": [{"platform":"tiktok", "hook":"Test Hook"}] }`;
    const result = await processAgentResponse(input);
    
    console.log('Result type:', typeof result);
    console.log('Result Keys:', Object.keys(result));
    console.log('Result Text:', result.text);
    console.log('Result Action:', result.action);
    
    if (typeof result === 'object' && result.action === 'create_posts' && result.text.includes('Success!')) {
        console.log('✅ PASS: Backend returned structured object for dashboard.');
    } else {
        console.log('❌ FAIL: Backend did not return expected object structure.');
    }
}

verifyComponentResponse().catch(console.error);
