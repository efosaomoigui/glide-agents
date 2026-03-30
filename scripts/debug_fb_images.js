const sqlite = require('sqlite-sync');
const path = require('path');
sqlite.connect(path.resolve(__dirname, '../data/paperly.db'));

console.log('=== Recent Posts - Checking Visual Data ===\n');
const posts = sqlite.run(`
  SELECT id, platform, status, content_type, visual_assets, hook, visual_data
  FROM posts 
  ORDER BY id DESC LIMIT 8
`);

posts.forEach(p => {
  console.log(`ID: ${p.id} | ${p.platform} | ${p.status} | ${p.content_type}`);
  console.log(`  Hook: ${p.hook ? p.hook.substring(0, 70) : 'N/A'}`);
  console.log(`  visual_assets: ${p.visual_assets || '*** EMPTY ***'}`);
  
  // Check if visual_data column exists and has image_url
  if (p.visual_data) {
    try {
      const vd = JSON.parse(p.visual_data);
      console.log(`  image_url in data: ${vd.image_url || vd.data?.image_url || '*** MISSING ***'}`);
    } catch(e) {
      console.log(`  visual_data raw: ${String(p.visual_data).substring(0, 100)}`);
    }
  }
  console.log('');
});

console.log('=== Recent Errors ===');
const errs = sqlite.run('SELECT message FROM errors ORDER BY id DESC LIMIT 5');
errs.forEach(e => console.log(' -', e.message));

sqlite.close();
