const sqlite = require('sqlite-sync');
const path = require('path');

const dbPath = path.join(__dirname, 'data/paperly.db');
console.log('Connecting to:', dbPath);
sqlite.connect(dbPath);

console.log('--- LATEST 3 CONVERSATIONS ---');
const convos = sqlite.run('SELECT id, role, content, created_at FROM conversations ORDER BY id DESC LIMIT 3');
console.log(JSON.stringify(convos, null, 2));

console.log('\n--- LATEST 3 ERRORS ---');
const errors = sqlite.run('SELECT * FROM errors ORDER BY id DESC LIMIT 3');
console.log(JSON.stringify(errors, null, 2));

console.log('\n--- POSTS TABLE STATUS ---');
const postCount = sqlite.run('SELECT COUNT(*) as c FROM posts');
console.log('Total posts:', postCount[0].c);

if (postCount[0].c > 0) {
  const latestPosts = sqlite.run('SELECT id, platform, status, created_at FROM posts ORDER BY id DESC LIMIT 5');
  console.log('Latest posts:', JSON.stringify(latestPosts, null, 2));
}
