const sqlite = require('sqlite-sync');
const path = require('path');

sqlite.connect(path.join(__dirname, 'data/paperly.db'));

console.log('--- LATEST 10 MESSAGES ---');
const messages = sqlite.run('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 10');
console.log(JSON.stringify(messages, null, 2));

console.log('\n--- LATEST 5 POSTS ---');
const posts = sqlite.run('SELECT * FROM posts ORDER BY created_at DESC LIMIT 5');
console.log(JSON.stringify(posts, null, 2));

console.log('\n--- LATEST 5 ERRORS ---');
const errors = sqlite.run('SELECT * FROM errors ORDER BY created_at DESC LIMIT 5');
console.log(JSON.stringify(errors, null, 2));
