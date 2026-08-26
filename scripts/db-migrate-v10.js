const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 10) {
  console.log('Starting migration from v9 to v10 (Hole-by-Hole Live Scoring, Attest & Stats)...');
  db.transaction(() => {
    // 1. Add score attestation and scorecard photo fields.
    const scoreCols = db.pragma('table_info(scores)').map(c => c.name);
    if (!scoreCols.includes('attested_by_team_id')) {
      db.exec(`ALTER TABLE scores ADD COLUMN attested_by_team_id INTEGER`);
    }
    if (!scoreCols.includes('attestation_status')) {
      db.exec(`ALTER TABLE scores ADD COLUMN attestation_status TEXT DEFAULT 'attested'`);
    }
    if (!scoreCols.includes('scorecard_photo_url')) {
      db.exec(`ALTER TABLE scores ADD COLUMN scorecard_photo_url TEXT`);
    }

    // 2. Add detailed hole-by-hole statistics for putts, fairways, GIR, and sand saves.
    db.exec(`
      CREATE TABLE IF NOT EXISTS score_hole_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        score_id INTEGER NOT NULL,
        hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
        gross_score INTEGER NOT NULL,
        putts INTEGER DEFAULT 2,
        fairway_hit BOOLEAN DEFAULT 1,
        gir BOOLEAN DEFAULT 0,
        sand_saves BOOLEAN DEFAULT 0,
        penalty_strokes INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(score_id) REFERENCES scores(id),
        UNIQUE(score_id, hole_number)
      );
    `);

    // 3. Add a score audit log that records who changed each hole.
    db.exec(`
      CREATE TABLE IF NOT EXISTS score_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        score_id INTEGER NOT NULL,
        hole_number INTEGER,
        old_gross INTEGER,
        new_gross INTEGER,
        reason TEXT,
        modified_by TEXT DEFAULT 'admin',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(score_id) REFERENCES scores(id)
      );
    `);

    db.pragma('user_version = 10');
  })();

  console.log('Migration v10 applied successfully.');
} else {
  console.log('Database is already at version 10 or higher. No migration needed.');
}

db.close();
