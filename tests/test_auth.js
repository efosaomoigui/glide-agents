const axios = require('axios');
require('dotenv').config();

const PORT = process.env.PORT || 4001;
const API = `http://localhost:${PORT}/api`;
const PASS = process.env.DASHBOARD_PASSWORD;

async function test() {
  console.log(`🔐 Testing Authentication against ${API}...`);
  console.log(`🔑 Configured Password: ${PASS ? '*****' : 'MISSING'}`);

  if (!PASS) {
    console.error('❌ DASHBOARD_PASSWORD not set in environment.');
    process.exit(1);
  }

  // 1. Test without authorization
  try {
    console.log('\n--- Test 1: No Authorization ---');
    await axios.get(`${API}/stats`);
    console.error('❌ FAIL: Request succeeded without password!');
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.log('✅ SUCCESS: Request blocked as expected (401).');
    } else {
      console.error('⚠️ UNEXPECTED ERROR:', err.message);
    }
  }

  // 2. Test with WRONG authorization
  try {
    console.log('\n--- Test 2: Wrong Authorization ---');
    await axios.get(`${API}/stats`, {
      headers: { 'Authorization': 'Bearer wrong_password' }
    });
    console.error('❌ FAIL: Request succeeded with WRONG password!');
  } catch (err) {
    if (err.response && err.response.status === 401) {
      console.log('✅ SUCCESS: Request blocked with wrong password (401).');
    } else {
      console.error('⚠️ UNEXPECTED ERROR:', err.message);
    }
  }

  // 3. Test with CORRECT authorization
  try {
    console.log('\n--- Test 3: Correct Authorization ---');
    const res = await axios.get(`${API}/stats`, {
      headers: { 'Authorization': `Bearer ${PASS}` }
    });
    console.log('✅ SUCCESS: Request authorized (200).');
    console.log('📊 Stats Received:', Object.keys(res.data).join(', '));
  } catch (err) {
    console.error('❌ FAIL: Request rejected with CORRECT password:', err.message);
    if (err.response) console.error('   Status:', err.response.status, err.response.data);
  }

  // 4. Test unauthenticated skip (/health)
  try {
    console.log('\n--- Test 4: Unauthenticated Health Check ---');
    const res = await axios.get(`${API}/health`);
    console.log('✅ SUCCESS: Health check allowed (200).');
  } catch (err) {
    console.error('❌ FAIL: Health check blocked:', err.message);
  }
}

test();
