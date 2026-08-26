const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 12) {
  console.log('Starting migration from v11 to v12 (Clubhouse TV & Digital Signage)...');
  db.transaction(() => {
    // 1. TV displays table.
    db.exec(`
      CREATE TABLE IF NOT EXISTS tv_displays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        template_type TEXT DEFAULT 'leaderboard_ticker',
        auto_scroll_speed INTEGER DEFAULT 10,
        show_announcements BOOLEAN DEFAULT 1,
        announcement_text TEXT DEFAULT 'Welcome to your Birvo league! • Follow live scores from the mobile player portal.',
        celebration_effects BOOLEAN DEFAULT 1,
        sound_enabled BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(league_id) REFERENCES leagues(id)
      );
    `);

    // 2. Sponsor ve Reklam Tablosu
    db.exec(`
      CREATE TABLE IF NOT EXISTS tv_sponsors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        logo_url TEXT,
        display_order INTEGER DEFAULT 1,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(league_id) REFERENCES leagues(id)
      );
    `);

    // Default TV display for active leagues
    const leagues = db.prepare("SELECT id FROM leagues WHERE status = 'active'").all();
    const insertTV = db.prepare(`
      INSERT OR IGNORE INTO tv_displays (league_id, name, template_type, auto_scroll_speed)
      VALUES (?, 'Clubhouse Main Screen', 'leaderboard_ticker', 8)
    `);
    const insertSponsor = db.prepare(`
      INSERT OR IGNORE INTO tv_sponsors (league_id, name, logo_url, display_order)
      VALUES (?, 'Birvo Premier Partner', '/golf-ball.png', 1)
    `);

    for (const l of leagues) {
      insertTV.run(l.id);
      insertSponsor.run(l.id);
    }

    db.pragma('user_version = 12');
  })();

  console.log('Migration v12 applied successfully.');
} else {
  console.log('Database is already at version 12 or higher. No migration needed.');
}

db.close();
