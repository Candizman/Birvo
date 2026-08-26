const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 11) {
  console.log('Starting migration from v10 to v11 (Player Profile, Badges, Bag & Notes)...');
  db.transaction(() => {
    // 1. Player profile.
    db.exec(`
      CREATE TABLE IF NOT EXISTS player_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL UNIQUE,
        bio TEXT,
        avatar_url TEXT,
        favorite_club TEXT DEFAULT '7 Iron',
        handicap_goal REAL DEFAULT 5.0,
        theme_preference TEXT DEFAULT 'dark',
        language TEXT DEFAULT 'tr',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(team_id) REFERENCES teams(id)
      );
    `);

    // 2. Trophy case and achievement badges.
    db.exec(`
      CREATE TABLE IF NOT EXISTS player_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        badge_key TEXT NOT NULL,
        badge_title TEXT NOT NULL,
        badge_icon TEXT NOT NULL,
        awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(team_id) REFERENCES teams(id)
      );
    `);

    // 3. Golf bag and equipment.
    db.exec(`
      CREATE TABLE IF NOT EXISTS player_bag_clubs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        club_name TEXT NOT NULL,
        brand TEXT,
        avg_distance_meters INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(team_id) REFERENCES teams(id)
      );
    `);

    // 4. Round notes and golf journal.
    db.exec(`
      CREATE TABLE IF NOT EXISTS round_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        week_number INTEGER NOT NULL,
        notes TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(team_id) REFERENCES teams(id)
      );
    `);

    // Backfill standard profile for active teams
    const teams = db.prepare('SELECT id FROM teams').all();
    const insertProfile = db.prepare(`
      INSERT OR IGNORE INTO player_profiles (team_id, bio, favorite_club, handicap_goal)
      VALUES (?, 'Birvo League Player', 'Driver', 5.0)
    `);
    for (const t of teams) {
      insertProfile.run(t.id);
    }

    db.pragma('user_version = 11');
  })();

  console.log('Migration v11 applied successfully.');
} else {
  console.log('Database is already at version 11 or higher. No migration needed.');
}

db.close();
