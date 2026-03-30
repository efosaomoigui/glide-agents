const sqlite = require('sqlite-sync');
const path = require('path');

const dbPath = path.resolve(__dirname, '../data/paperly.db');
sqlite.connect(dbPath);

console.log('--- DB DEBUG ---');

console.log('\n[Settings Check]');
const fbAuto = sqlite.run("SELECT value FROM settings WHERE key = 'auto_post_facebook'")[0]?.value;
const paused = sqlite.run("SELECT value FROM settings WHERE key = 'posting_paused'")[0]?.value;
console.log(`auto_post_facebook: ${fbAuto}`);
console.log(`posting_paused: ${paused}`);

console.log('\n[Facebook Posts (Newest 5)]');
const fbPosts = sqlite.run("SELECT id, status, created_at, platform_post_id FROM posts WHERE platform = 'facebook' ORDER BY id DESC LIMIT 5");
fbPosts.forEach(p => console.log(`ID: ${p.id} | Status: ${p.status} | Created: ${p.created_at} | RemoteID: ${p.platform_post_id}`));

console.log('\n[Full Recent Errors]');
const errors = sqlite.run('SELECT * FROM errors ORDER BY id DESC LIMIT 5');
errors.forEach(e => {
  console.log(`\nID: ${e.id} | Created: ${e.created_at}`);
  console.log(`Msg: ${e.message}`);
  // console.log(`Stack: ${e.stack ? e.stack.substring(0, 200) : 'N/A'}`);
});

sqlite.close();
