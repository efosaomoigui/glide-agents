
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'data/paperly.db');
const repairPath = path.join(__dirname, 'data/paperly_repaired.db');

console.log('🛠 Starting Database Repair for:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Could not open database:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database with native sqlite3.');
  
  // We VACUUM the database into a new file. This creates a clean, 
  // standard SQLite file that should be compatible with sqlite-sync.
  db.serialize(() => {
    // Ensure WAL is off for maximum compatibility with JS engines
    db.run('PRAGMA journal_mode = DELETE;');
    
    db.run(`VACUUM INTO ?`, [repairPath], (err) => {
      if (err) {
        console.error('❌ Vacuum failed:', err.message);
        db.close();
        process.exit(1);
      }
      console.log('✅ Database vacuumed into:', repairPath);
      db.close(() => {
        // Replace old with repaired
        try {
          fs.renameSync(repairPath, dbPath);
          console.log('🚀 Successfully replaced original database with repaired version.');
        } catch (e) {
          console.error('❌ Failed to replace database file:', e.message);
        }
        process.exit(0);
      });
    });
  });
});
