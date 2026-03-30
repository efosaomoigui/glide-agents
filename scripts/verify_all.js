const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { testFacebookConnection } = require('../server/social/facebook');
const { testInstagramConnection } = require('../server/social/instagram');
const { testTwitterConnection } = require('../server/social/twitter');
const { testTikTokConnection } = require('../server/social/tiktok');

async function verifyAll() {
  console.log('--- GLOBAL CONNECTION VERIFICATION ---\n');

  // 1. Gemini
  console.log('🤖 Testing Gemini (v1 / gemini-3-flash-preview)...');
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: 'v1' });
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    const result = await model.generateContent("Hello, respond with 'Connectivity OK'");
    console.log('✅ Gemini:', result.response.text());
  } catch (err) {
    console.error('❌ Gemini Error:', err.message);
  }

  // 2. Facebook
  console.log('\n🔵 Testing Facebook...');
  try {
    const result = await testFacebookConnection();
    console.log('✅ Facebook connected as:', result.name);
  } catch (err) {
    console.error('❌ Facebook Error:', err.response?.data || err.message);
  }

  // 3. Instagram
  console.log('\n📸 Testing Instagram...');
  try {
    const result = await testInstagramConnection();
    console.log('✅ Instagram connected as:', result.username);
  } catch (err) {
    console.error('❌ Instagram Error:', err.response?.data || err.message);
  }

  // 4. Twitter (X)
  console.log('\n🐦 Testing X (Twitter)...');
  try {
    const result = await testTwitterConnection();
    console.log('✅ X connected as:', result.username);
  } catch (err) {
    console.error('❌ X Error:', err.message);
  }

  // 5. TikTok
  console.log('\n🎵 Testing TikTok (Expect failure if token expired)...');
  try {
    const result = await testTikTokConnection();
    console.log('✅ TikTok connected as:', result.display_name);
  } catch (err) {
    console.log('❌ TikTok (Deferred):', err.response?.data || err.message);
  }

  console.log('\n--- VERIFICATION COMPLETE ---');
}

verifyAll();
