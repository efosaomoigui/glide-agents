const sqlite = require('sqlite-sync');
const path = require('path');

const dbPath = path.resolve(__dirname, 'data/paperly.db');
console.log('📦 Connecting to:', dbPath);
sqlite.connect(dbPath);
const db = sqlite;

function getDashboardStats() {
  try {
    const draftsQueued = (db.run(`
      SELECT COUNT(*) as count FROM posts WHERE status IN ('draft', 'approved', 'failed')
    `)[0]?.count) || 0;

    const totalPostsInDb = (db.run('SELECT COUNT(*) as count FROM posts')[0]?.count) || 0;

    return { draftsQueued, totalPostsInDb };
  } catch (err) {
    return { error: err.message };
  }
}

console.log('RESULT:', JSON.stringify(getDashboardStats(), null, 2));
