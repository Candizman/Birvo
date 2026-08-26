const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 4) {
  console.log('Starting migration from v3 to v4...');
  db.transaction(() => {
    // V4: Add PIN column to teams
    db.exec(`ALTER TABLE teams ADD COLUMN pin TEXT DEFAULT '0000'`);

    // Generate PINs for existing teams.
    const teams = db.prepare("SELECT id FROM teams WHERE pin = '0000'").all();
    const updatePin = db.prepare('UPDATE teams SET pin = ? WHERE id = ?');

    for (const team of teams) {
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      updatePin.run(pin, team.id);
    }

    db.pragma('user_version = 4');
  })();

  console.log('Migration v4 applied successfully.');
} else {
  console.log('Database is already at version 4 or higher. No migration needed.');
}

db.close();
