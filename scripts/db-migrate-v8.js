const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 8) {
  console.log('Starting migration from v7 to v8 (WHS Handicap & Audit Trail)...');
  db.transaction(() => {
    const teamCols = db.pragma('table_info(teams)').map(c => c.name);
    if (!teamCols.includes('ghin_number')) {
      db.exec(`ALTER TABLE teams ADD COLUMN ghin_number TEXT`);
    }
    if (!teamCols.includes('low_handicap_365')) {
      db.exec(`ALTER TABLE teams ADD COLUMN low_handicap_365 REAL DEFAULT 0.0`);
    }

    db.exec(`
      CREATE TABLE IF NOT EXISTS handicap_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        match_id INTEGER,
        old_handicap REAL NOT NULL,
        new_handicap REAL NOT NULL,
        differential REAL,
        change_type TEXT DEFAULT 'auto_round',
        reason TEXT,
        modified_by TEXT DEFAULT 'system',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(team_id) REFERENCES teams(id),
        FOREIGN KEY(match_id) REFERENCES matches(id)
      );
    `);

    // Backfill low_handicap_365 with current_handicap
    db.prepare('UPDATE teams SET low_handicap_365 = current_handicap WHERE low_handicap_365 = 0.0').run();

    db.pragma('user_version = 8');
  })();

  console.log('Migration v8 applied successfully.');
} else {
  console.log('Database is already at version 8 or higher. No migration needed.');
}

db.close();
