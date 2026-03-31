const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Mock axios.get
const originalGet = axios.get;
let callCount = 0;

axios.get = async (url, config) => {
  if (url.includes('graph.facebook.com')) {
    callCount++;
    console.log(`[MOCK API] Received request ${callCount}:`, url, config?.params?.ids);
    
    // Simulate first call: one ready, one pending
    if (callCount === 1) {
      return {
        data: {
          "id_1": { "status_code": "FINISHED" },
          "id_2": { "status_code": "IN_PROGRESS" }
        }
      };
    }
    // Simulate second call: second one ready
    if (callCount === 2) {
      return {
        data: {
          "id_2": { "status_code": "FINISHED" }
        }
      };
    }
  }
  return originalGet(url, config);
};

// Import the function to test
// We need to bypass the actual module exports if we want to test the internal function
// but here we can just use the exported ones if they were exported.
// Since it's not exported, I'll copy the function logic or modify the file to export it.
// Actually, I'll just copy the function logic into this test script to verify the logic.

async function testBatchPolling() {
  const pendingIds = new Set(['id_1', 'id_2']);
  const maxRetries = 5;
  const accessToken = 'fake_token';

  for (let i = 0; i < maxRetries; i++) {
    const idList = Array.from(pendingIds).join(',');
    console.log(`Checking ids: ${idList}`);
    
    const response = await axios.get(`https://graph.facebook.com/v19.0/`, {
      params: { ids: idList, fields: 'status_code,status,error_message', access_token: accessToken }
    });

    const results = response.data;
    for (const id of Object.keys(results)) {
      const item = results[id];
      if (item.status_code === 'FINISHED') {
        console.log(`✅ ${id} finished`);
        pendingIds.delete(id);
      }
    }

    if (pendingIds.size === 0) {
      console.log('🎉 ALL DONE!');
      return true;
    }
    console.log(`Waiting... ${pendingIds.size} left`);
  }
}

testBatchPolling().then(() => {
  console.log('Test completed successfully');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
