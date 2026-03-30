const sqlite = require('sqlite-sync');
const path = require('path');

const dbPath = path.join(__dirname, 'data/paperly.db');
sqlite.connect(dbPath);

try {
  console.log('Inserting test post (using db.insert)...');
  const result = sqlite.insert('posts', {
    platform: 'test_insert_method',
    hook: 'test_hook',
    body: 'test_body',
    cta: 'test_cta',
    image_prompts: '[]',
    caption: 'test_caption',
    hashtags: '[]',
    status: 'draft',
    scheduled_for: null
  });
  console.log('Result (ID):', result);
  
  const count = sqlite.run('SELECT COUNT(*) as c FROM posts')[0].c;
  console.log('New post count:', count);
} catch (err) {
  console.error('Insert failed:', err.message);
}
