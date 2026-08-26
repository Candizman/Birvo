const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 9) {
  console.log('Starting migration from v8 to v9 (Fixture Engine, Substitutes & RSVPs)...');
  db.transaction(() => {
    // 1. Match fixtures and schedule table.
    db.exec(`
      CREATE TABLE IF NOT EXISTS match_fixtures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_id INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        team1_id INTEGER,
        team2_id INTEGER,
        scheduled_date TEXT,
        scheduled_time TEXT DEFAULT '09:00',
        is_bye BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(league_id) REFERENCES leagues(id),
        FOREIGN KEY(team1_id) REFERENCES teams(id),
        FOREIGN KEY(team2_id) REFERENCES teams(id)
      );
    `);

    // 2. Substitute player pool.
    db.exec(`
      CREATE TABLE IF NOT EXISTS substitutes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        handicap REAL DEFAULT 0.0,
        phone TEXT,
        email TEXT,
        status TEXT DEFAULT 'available',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(league_id) REFERENCES leagues(id)
      );
    `);

    // 3. Player availability and RSVP table.
    db.exec(`
      CREATE TABLE IF NOT EXISTS player_rsvps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        status TEXT DEFAULT 'attending',
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(team_id) REFERENCES teams(id),
        UNIQUE(team_id, week_number)
      );
    `);

    db.pragma('user_version = 9');
  })();

  console.log('Migration v9 applied successfully.');
} else {
  console.log('Database is already at version 9 or higher. No migration needed.');
}

db.close();
