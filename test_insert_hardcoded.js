const sqlite = require('sqlite-sync');
const path = require('path');

const dbPath = path.join(__dirname, 'data/paperly.db');
sqlite.connect(dbPath);

try {
  console.log('Inserting test post (HARCODE ALL)...');
  const result = sqlite.run(`
    INSERT INTO posts (platform, hook, body, cta, image_prompts, caption, hashtags, status, scheduled_for)
    VALUES ('hardcoded_platform', 'hook', 'body', 'cta', '[]', 'caption', '[]', 'draft', NULL)
  `);
  console.log('Result:', result);
  
  const count = sqlite.run('SELECT COUNT(*) as c FROM posts')[0].c;
  console.log('New post count:', count);
} catch (err) {
  console.error('Insert failed:', err.message);
}
