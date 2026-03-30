const crypto = require('crypto');

function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

// 1. Generate a random code verifier
const codeVerifier = base64URLEncode(crypto.randomBytes(32));

// 2. Generate the code challenge from the verifier
const codeChallenge = base64URLEncode(sha256(codeVerifier));

// 3. Your Client Details (from your .env)
const clientKey = 'sbawpozec6oefzdi73';
const redirectUri = 'https://oauth.pstmn.io/v1/callback'; // Match your Postman setting
const scope = 'user.info.basic,video.upload,video.publish';
const state = 'random_state_' + Math.floor(Math.random() * 1000000);

// 4. Construct the URL
const authUrl = `https://www.tiktok.com/v2/auth/authorize/` +
  `?client_key=${clientKey}` +
  `&scope=${scope}` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(redirectUri)}` +
  `&state=${state}` +
  `&code_challenge=${codeChallenge}` +
  `&code_challenge_method=S256`;

console.log('\n--- TIKTOK PKCE LOGIN HELPER ---');
console.log('\nSTEP 1: SAVE YOUR VERIFIER');
console.log('---------------------------------------------------');
console.log('IMPORTANT: Keep this verifier! You will need it to get your tokens later.');
console.log('CODE_VERIFIER:', codeVerifier);
console.log('---------------------------------------------------');

console.log('\nSTEP 2: OPEN THIS URL IN YOUR BROWSER');
console.log('---------------------------------------------------');
console.log(authUrl);
console.log('---------------------------------------------------');

console.log('\nSTEP 3: AUTHORIZE AND GET THE CODE');
console.log('Log in as paperly001, authorize, and then copy the "code" from the address bar.');
console.log('---------------------------------------------------');
