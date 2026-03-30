const sqlite = require('sqlite-sync');
const path = require('path');
const dbPath = path.resolve(__dirname, 'data/paperly.db');
sqlite.connect(dbPath);
sqlite.run("UPDATE posts SET status = 'posted' WHERE id = 153");
console.log('Post 153 marked as posted.');
