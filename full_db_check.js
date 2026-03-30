const sqlite = require('sqlite-sync');
const path = require('path');

const dbPath = path.join(__dirname, 'data/paperly.db');
sqlite.connect(dbPath);

const tables = sqlite.run('SELECT name FROM sqlite_master WHERE type="table"');
console.log('--- TABLE ROW COUNTS ---');
for (const table of tables) {
  const count = sqlite.run(`SELECT COUNT(*) as c FROM "${table.name}"`)[0].c;
  console.log(`${table.name}: ${count}`);
}

console.log('\n--- LATEST 10 LOGS (ANY TABLE) ---');
// Try to find ANY record modified in the last 10 minutes
// Since we don't have a global log, we'll just look at the last IDs of each table
for (const table of tables) {
    if (table.name === 'sqlite_sequence') continue;
    const latest = sqlite.run(`SELECT * FROM "${table.name}" ORDER BY rowid DESC LIMIT 1`);
    if (latest.length > 0) {
        console.log(`Latest from ${table.name}:`, JSON.stringify(latest[0], null, 2));
    }
}
