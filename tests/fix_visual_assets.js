const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/paperly.db');
const imagesDir = path.join(__dirname, '../data/local-images');

try {
  const db = new Database(dbPath);
  const posts = db.prepare('SELECT id, visual_assets FROM posts').all();
  
  console.log('🔍 Scanning database for stray draft images...');
  
  for (const post of posts) {
    if (!post.visual_assets) continue;
    let assets = JSON.parse(post.visual_assets);
    let updated = false;
    
    const newAssets = assets.map(asset => {
      // If asset is a draft image, look for a corresponding post image on disk
      if (asset.includes('stamped-draft')) {
        console.log(`   [Post ${post.id}] Found draft asset: ${asset}`);
        // Look for any post_*.png in the folder
        const files = fs.readdirSync(imagesDir);
        const renderedFile = files.find(f => f.startsWith('post_') && f.endsWith('.png'));
        
        if (renderedFile) {
          console.log(`      ✨ Found rendered replacement: ${renderedFile}`);
          updated = true;
          return `/local-images/${renderedFile}`;
        }
      }
      return asset;
    });
    
    if (updated) {
      db.prepare('UPDATE posts SET visual_assets = ? WHERE id = ?').run(JSON.stringify(newAssets), post.id);
      console.log(`   ✅ [Post ${post.id}] Updated to use rendered asset.`);
    }
  }
  
  console.log('🏁 Database sync complete.');
} catch (err) {
  console.error('❌ Sync failed:', err.message);
}
