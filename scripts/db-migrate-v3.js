const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 3) {
  console.log('Starting migration from v2 to v3...');
  db.transaction(() => {
    // V3: Create users table for auth mapping
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        course_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      );
    `);

    // Insert a dummy user mapping for the demo context if there is none
    // UUID format to mock Supabase user id
    const dummyUUID = '00000000-0000-0000-0000-000000000000';
    try {
      db.prepare(`INSERT OR IGNORE INTO users (id, email, role, course_id) VALUES (?, ?, ?, ?)`).run(dummyUUID, 'admin@birvo.com', 'admin', 1);
    } catch (e) {
      console.log('Error while adding the placeholder user:', e.message);
    }

    db.pragma('user_version = 3');
  })();

  console.log('Migration v3 applied successfully.');
} else {
  console.log('Database is already at version 3 or higher. No migration needed.');
}

db.close();
