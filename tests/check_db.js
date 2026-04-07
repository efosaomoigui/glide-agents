const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../data/paperly.db');

try {
  const db = new Database(dbPath);
  const rows = db.prepare('SELECT id, platform, visual_assets, status, created_at FROM posts ORDER BY id DESC LIMIT 5').all();
  console.log('--- LATEST 5 POSTS ---');
  rows.forEach(row => {
    console.log(`ID: ${row.id} | Platform: ${row.platform} | Status: ${row.status} | Created: ${row.created_at}`);
    console.log(`Assets: ${row.visual_assets}`);
    console.log('----------------------');
  });
} catch (err) {
  console.error('Failed to read DB:', err.message);
}
