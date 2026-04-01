const { processAgentResponse } = require('./server/index.js');

async function testRegex() {
    const mock = "Certainly! \n```json\n{\"action\":\"create_posts\", \"posts\": [{\"platform\":\"test\"}]}\n```\nMore text.";
    console.log('--- MOCK INPUT ---');
    console.log(mock);
    console.log('------------------');
    
    const result = await processAgentResponse(mock);
    console.log('--- CLEANED RESULT ---');
    console.log(result);
    console.log('----------------------');
    
    if (result.includes('Success')) {
        console.log('✅ Regex successfully extracted JSON and triggered handler summary!');
    } else {
        console.log('❌ Extraction or summary failed.');
    }
}

testRegex().catch(console.error);
