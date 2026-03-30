const sqlite = require('sqlite-sync');
const path = require('path');

const dbPath = path.join(__dirname, 'data/paperly.db');
console.log('Connecting to:', dbPath);
sqlite.connect(dbPath);

console.log('--- TABLES ---');
const tables = sqlite.run('SELECT name FROM sqlite_master WHERE type="table"');
console.log(JSON.stringify(tables, null, 2));

console.log('\n--- POSTS COUNT BY STATUS ---');
const counts = sqlite.run('SELECT status, COUNT(*) as c FROM posts GROUP BY status');
console.log(JSON.stringify(counts, null, 2));

console.log('\n--- ALL POSTS (LAST 10) ---');
const posts = sqlite.run('SELECT id, platform, status, created_at FROM posts ORDER BY id DESC LIMIT 10');
console.log(JSON.stringify(posts, null, 2));

console.log('\n--- SETTINGS ---');
const settings = sqlite.run('SELECT * FROM settings');
console.log(JSON.stringify(settings, null, 2));
