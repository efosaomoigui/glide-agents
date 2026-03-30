const sqlite = require('sqlite-sync');
const path = require('path');

sqlite.connect(path.join(__dirname, 'data/paperly.db'));
const messages = sqlite.run('SELECT * FROM conversations ORDER BY created_at DESC LIMIT 5');
console.log(JSON.stringify(messages, null, 2));
