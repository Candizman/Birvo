const { createDatabase } = require('../lib/database/createDatabase');
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : 'birvo.db';
const db = createDatabase(dbPath);

console.log(`Database Path: ${dbPath}`);

const userVersion = db.pragma('user_version', { simple: true });
console.log(`Current User Version: ${userVersion}`);

if (userVersion < 6) {
  console.log('Starting migration from v5 to v6 (Course & Facility Management)...');
  db.transaction(() => {
    // 1. Add branding, address, weather coordinates, and local rules to courses.
    const courseCols = db.pragma('table_info(courses)').map(c => c.name);
    if (!courseCols.includes('logo_url')) db.exec(`ALTER TABLE courses ADD COLUMN logo_url TEXT`);
    if (!courseCols.includes('primary_color')) db.exec(`ALTER TABLE courses ADD COLUMN primary_color TEXT DEFAULT '#d4af37'`);
    if (!courseCols.includes('address')) db.exec(`ALTER TABLE courses ADD COLUMN address TEXT DEFAULT 'Pebble Beach, CA 93953'`);
    if (!courseCols.includes('city')) db.exec(`ALTER TABLE courses ADD COLUMN city TEXT DEFAULT 'Monterey'`);
    if (!courseCols.includes('weather_lat')) db.exec(`ALTER TABLE courses ADD COLUMN weather_lat REAL DEFAULT 36.5684`);
    if (!courseCols.includes('weather_lon')) db.exec(`ALTER TABLE courses ADD COLUMN weather_lon REAL DEFAULT -121.9507`);
    if (!courseCols.includes('contact_email')) db.exec(`ALTER TABLE courses ADD COLUMN contact_email TEXT DEFAULT 'info@pebblebeach.com'`);
    if (!courseCols.includes('contact_phone')) db.exec(`ALTER TABLE courses ADD COLUMN contact_phone TEXT DEFAULT '+1 (800) 654-9300'`);
    if (!courseCols.includes('local_rules')) db.exec(`ALTER TABLE courses ADD COLUMN local_rules TEXT DEFAULT '1. All fences and white stakes are considered out of bounds (OB).\n2. The cart path near hole 3 qualifies for free relief.\n3. Loose impediments such as stones and leaves may be removed from bunkers.'`);

    // 2. Add hole-by-hole course architecture, par, stroke index, pin positions, and maintenance status.
    db.exec(`
      CREATE TABLE IF NOT EXISTS course_holes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        hole_number INTEGER NOT NULL CHECK(hole_number >= 1 AND hole_number <= 18),
        par INTEGER NOT NULL DEFAULT 4 CHECK(par >= 3 AND par <= 6),
        stroke_index INTEGER NOT NULL CHECK(stroke_index >= 1 AND stroke_index <= 18),
        pin_position TEXT DEFAULT 'center',
        is_under_maintenance BOOLEAN DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id),
        UNIQUE(course_id, hole_number)
      );
    `);

    // 3. Add tee-box management, colors, yardage, slope, and course rating.
    db.exec(`
      CREATE TABLE IF NOT EXISTS course_tee_boxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        course_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color_hex TEXT NOT NULL,
        gender TEXT DEFAULT 'all',
        course_rating REAL DEFAULT 72.0,
        slope_rating INTEGER DEFAULT 113,
        total_yards INTEGER DEFAULT 6400,
        total_meters INTEGER DEFAULT 5852,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(course_id) REFERENCES courses(id)
      );
    `);

    // 4. Tee Time & Shotgun Planlama Tablosu
    db.exec(`
      CREATE TABLE IF NOT EXISTS tee_times (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        league_id INTEGER NOT NULL,
        week_number INTEGER NOT NULL DEFAULT 1,
        start_time TEXT NOT NULL,
        starting_hole INTEGER DEFAULT 1,
        starting_group TEXT DEFAULT 'A',
        team1_id INTEGER,
        team2_id INTEGER,
        status TEXT DEFAULT 'scheduled',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(league_id) REFERENCES leagues(id),
        FOREIGN KEY(team1_id) REFERENCES teams(id),
        FOREIGN KEY(team2_id) REFERENCES teams(id)
      );
    `);

    // 5. Generate 18 holes and starter tee-box data for existing courses.
    const courses = db.prepare('SELECT id FROM courses').all();
    const defaultPars = [4, 4, 3, 5, 4, 4, 3, 5, 4,  4, 4, 3, 5, 4, 4, 3, 5, 4];
    const defaultStrokeIndexes = [7, 3, 15, 1, 11, 5, 17, 9, 13,  8, 4, 16, 2, 12, 6, 18, 10, 14];

    const insertHole = db.prepare(`
      INSERT OR IGNORE INTO course_holes (course_id, hole_number, par, stroke_index, pin_position, is_under_maintenance)
      VALUES (?, ?, ?, ?, 'center', 0)
    `);

    const insertTee = db.prepare(`
      INSERT OR IGNORE INTO course_tee_boxes (course_id, name, color_hex, gender, course_rating, slope_rating, total_yards, total_meters)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of courses) {
      for (let h = 1; h <= 18; h++) {
        insertHole.run(c.id, h, defaultPars[h - 1], defaultStrokeIndexes[h - 1]);
      }

      // Default 4 Tee Box
      insertTee.run(c.id, 'Siyah (Championship)', '#1e293b', 'men', 74.2, 135, 6850, 6263);
      insertTee.run(c.id, 'Beyaz (Men)', '#f8fafc', 'men', 72.0, 128, 6400, 5852);
      insertTee.run(c.id, 'Gold (Senior)', '#eab308', 'all', 70.4, 122, 5950, 5440);
      insertTee.run(c.id, 'Red (Women)', '#ef4444', 'women', 68.8, 116, 5200, 4754);
    }

    db.pragma('user_version = 6');
  })();

  console.log('Migration v6 applied successfully.');
} else {
  console.log('Database is already at version 6 or higher. No migration needed.');
}

db.close();
