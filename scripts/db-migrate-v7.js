const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 7) {
  console.log('Starting migration from v6 to v7 (Tournament & League Formats)...');
  db.transaction(() => {
    const leagueCols = db.pragma('table_info(leagues)').map(c => c.name);
    if (!leagueCols.includes('game_format')) {
      db.exec(`ALTER TABLE leagues ADD COLUMN game_format TEXT DEFAULT 'stroke_play'`);
    }
    if (!leagueCols.includes('playoff_bracket')) {
      db.exec(`ALTER TABLE leagues ADD COLUMN playoff_bracket TEXT`);
    }
    db.pragma('user_version = 7');
  })();

  console.log('Migration v7 applied successfully.');
} else {
  console.log('Database is already at version 7 or higher. No migration needed.');
}

db.close();
