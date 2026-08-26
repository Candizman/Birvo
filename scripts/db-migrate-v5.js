const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 5) {
  console.log('Starting migration from v4 to v5...');
  db.transaction(() => {
    // V5: Add current_week column to leagues
    db.exec(`ALTER TABLE leagues ADD COLUMN current_week INTEGER DEFAULT 1`);

    // Backward compatibility: start legacy leagues at week 3 so existing scores remain valid.
    db.prepare('UPDATE leagues SET current_week = 3').run();

    db.pragma('user_version = 5');
  })();

  console.log('Migration v5 applied successfully.');
} else {
  console.log('Database is already at version 5 or higher. No migration needed.');
}

db.close();
