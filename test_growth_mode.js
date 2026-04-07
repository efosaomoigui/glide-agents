const { chatWithGlide, processAgentResponse } = require('./server/index');

async function test() {
  console.log('--- Testing Reddit Research Request ---');
  const redditResponse = await chatWithGlide('Check Reddit for me today and find some good discussions.');
  const redditResult = await processAgentResponse(redditResponse);
  console.log('AGENT TEXT:', redditResult.text);
  
  console.log('\n--- Testing LinkedIn Content Request ---');
  const linkedinResponse = await chatWithGlide('Give me some LinkedIn post ideas based on our recent building work.');
  const linkedinResult = await processAgentResponse(linkedinResponse);
  console.log('AGENT TEXT:', linkedinResult.text);
  
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
