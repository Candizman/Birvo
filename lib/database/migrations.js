const { checkIntegrity } = require('./integrity');

function runMigrations(db, targetVersion = 17) {
  let userVersion = db.pragma('user_version', { simple: true });

  if (userVersion >= targetVersion) {
    const integrity = checkIntegrity(db);
    if (!integrity.integrityOk || !integrity.foreignKeysOk) {
      console.error(`user_version >= ${targetVersion} but integrity check failed!`);
    } else {
      return { status: 'already_up_to_date' };
    }
  }

  const originalFk = db.pragma('foreign_keys', { simple: true });

  try {
    db.pragma('foreign_keys = OFF');

    // V0 / V1 -> V2 Migration
    if (userVersion < 2 && targetVersion >= 2) {
      console.log(`Starting migration from v${userVersion} to v2...`);
      db.transaction(() => {
        const tables = db.pragma('table_list').filter(t => t.type === 'table').map(t => t.name);

        const getCols = (table) => tables.includes(table) ? db.pragma(`table_info(${table})`).map(c => c.name) : [];
        const scoresCols = getCols('scores');
        const hasWeekNumberInScores = scoresCols.includes('week_number');

        if (tables.includes('courses')) db.exec('ALTER TABLE courses RENAME TO courses_old');
        db.exec(`
          CREATE TABLE courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            stripe_status TEXT DEFAULT 'not_configured',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        if (tables.includes('courses')) {
          const cCols = db.pragma('table_info(courses_old)').map(c => c.name);
          const subStat = cCols.includes('subscription_status') ? 'subscription_status' : (cCols.includes('stripe_status') ? 'stripe_status' : "'not_configured'");
          db.exec(`INSERT INTO courses (id, name, stripe_status) SELECT id, name, ${subStat} FROM courses_old;`);
        }

        if (tables.includes('leagues')) db.exec('ALTER TABLE leagues RENAME TO leagues_old');
        db.exec(`
          CREATE TABLE leagues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            trashed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id)
          );
        `);
        if (tables.includes('leagues')) {
          const lCols = db.pragma('table_info(leagues_old)').map(c => c.name);
          db.exec(`INSERT INTO leagues (id, course_id, name, status) SELECT id, ${lCols.includes('course_id') ? 'course_id' : '1'}, name, ${lCols.includes('status') ? 'status' : "'active'"} FROM leagues_old;`);
        }

        if (tables.includes('teams')) db.exec('ALTER TABLE teams RENAME TO teams_old');
        db.exec(`
          CREATE TABLE teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            current_handicap REAL DEFAULT 0.0,
            status TEXT DEFAULT 'active',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(league_id) REFERENCES leagues(id)
          );
        `);
        if (tables.includes('teams')) {
          const tCols = db.pragma('table_info(teams_old)').map(c => c.name);
          db.exec(`INSERT INTO teams (id, league_id, name, current_handicap, status) SELECT id, ${tCols.includes('league_id') ? 'league_id' : '1'}, name, ${tCols.includes('current_handicap') ? 'current_handicap' : '0.0'}, ${tCols.includes('status') ? 'status' : "'active'"} FROM teams_old;`);
        }

        db.exec(`
          CREATE TABLE IF NOT EXISTS matches_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_id INTEGER NOT NULL,
            week_number INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(league_id) REFERENCES leagues(id),
            UNIQUE(league_id, week_number)
          );
        `);

        if (tables.includes('matches')) {
          db.exec('INSERT OR IGNORE INTO matches_new (id, league_id, week_number, status) SELECT id, league_id, week_number, status FROM matches');
        }

        if (tables.includes('scores') && hasWeekNumberInScores) {
          db.exec(`
            INSERT OR IGNORE INTO matches_new (league_id, week_number, status)
            SELECT DISTINCT t.league_id, s.week_number, 'completed'
            FROM scores s
            LEFT JOIN teams_old t ON s.team_id = t.id
            WHERE s.week_number IS NOT NULL
          `);
        }

        if (tables.includes('scores')) db.exec('ALTER TABLE scores RENAME TO scores_old');
        db.exec(`
          CREATE TABLE scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            gross_score INTEGER CHECK(gross_score >= 1 AND gross_score <= 200),
            handicap_used REAL,
            net_score REAL,
            points_earned REAL DEFAULT 0.0,
            reconciliation_status TEXT DEFAULT 'ok',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(match_id) REFERENCES matches_new(id),
            FOREIGN KEY(team_id) REFERENCES teams(id),
            UNIQUE(match_id, team_id)
          );
          CREATE TABLE migration_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT,
            reason TEXT,
            old_row_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);

        if (tables.includes('scores')) {
          const sCols = db.pragma('table_info(scores_old)').map(c => c.name);

          let matchIdExpression = 'NULL';
          if (sCols.includes('week_number') && sCols.includes('team_id')) {
            matchIdExpression = `
              (SELECT m.id FROM matches_new m
               JOIN teams_old t ON t.id = scores_old.team_id
               WHERE m.league_id = t.league_id AND m.week_number = scores_old.week_number)
            `;
          } else if (sCols.includes('match_id')) {
            matchIdExpression = 'scores_old.match_id';
          }

          const hUsed = sCols.includes('handicap_used') ? 'handicap_used' : 'NULL';
          const nScore = sCols.includes('net_score') ? 'net_score' : 'NULL';
          const gScore = sCols.includes('gross_score') ? 'gross_score' : (sCols.includes('strokes') ? 'strokes' : '72');
          const tId = sCols.includes('team_id') ? 'team_id' : '1';

          db.exec(`
            INSERT INTO scores (match_id, team_id, gross_score, handicap_used, net_score, reconciliation_status)
            SELECT
              mapped_match_id,
              team_id,
              gross_score,
              handicap_used,
              net_score,
              CASE WHEN handicap_used IS NULL OR net_score IS NULL THEN 'needs_review' ELSE 'ok' END
            FROM (
              SELECT
                ${matchIdExpression} as mapped_match_id,
                ${tId} as team_id,
                ${gScore} as gross_score,
                ${hUsed} as handicap_used,
                ${nScore} as net_score,
                id as old_id,
                ROW_NUMBER() OVER (PARTITION BY ${matchIdExpression}, ${tId} ORDER BY id DESC) as rn
              FROM scores_old
            ) WHERE rn = 1;
          `);

          db.exec(`
            INSERT INTO migration_audit (type, reason, old_row_data)
            SELECT 'score_deduplication', 'duplicate match_id/team_id', '{ "id": ' || old_id || ' }'
            FROM (
              SELECT id as old_id,
                     ROW_NUMBER() OVER (PARTITION BY ${matchIdExpression}, ${tId} ORDER BY id DESC) as rn
              FROM scores_old
            ) WHERE rn > 1;
          `);
        }

        if (tables.includes('matches')) db.exec('DROP TABLE matches');
        db.exec('ALTER TABLE matches_new RENAME TO matches');

        if (tables.includes('courses')) db.exec('DROP TABLE courses_old');
        if (tables.includes('leagues')) db.exec('DROP TABLE leagues_old');
        if (tables.includes('teams')) db.exec('DROP TABLE teams_old');
        if (tables.includes('scores')) db.exec('DROP TABLE scores_old');

        const integrity = checkIntegrity(db);
        if (!integrity.integrityOk || !integrity.foreignKeysOk) {
          throw new Error(`Integrity check failed post-migration: FK Ok? ${integrity.foreignKeysOk}, Data Ok? ${integrity.integrityOk}`);
        }

        db.pragma('user_version = 2');
      })();
      userVersion = 2;
      console.log('Migration v2 applied successfully.');
    }

    // V2 -> V3 Migration (Users table for auth)
    if (userVersion < 3 && targetVersion >= 3) {
      console.log('Starting migration from v2 to v3...');
      db.transaction(() => {
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
        db.pragma('user_version = 3');
      })();
      userVersion = 3;
      console.log('Migration v3 applied successfully.');
    }

    // V3 -> V4 Migration (PIN code for teams)
    if (userVersion < 4 && targetVersion >= 4) {
      console.log('Starting migration from v3 to v4...');
      db.transaction(() => {
        const teamCols = db.pragma('table_info(teams)').map(c => c.name);
        if (!teamCols.includes('pin')) {
          db.exec(`ALTER TABLE teams ADD COLUMN pin TEXT DEFAULT '0000'`);
        }
        const teams = db.prepare("SELECT id FROM teams WHERE pin = '0000'").all();
        const updatePin = db.prepare('UPDATE teams SET pin = ? WHERE id = ?');
        for (const team of teams) {
          const pin = Math.floor(1000 + Math.random() * 9000).toString();
          updatePin.run(pin, team.id);
        }
        db.pragma('user_version = 4');
      })();
      userVersion = 4;
      console.log('Migration v4 applied successfully.');
    }

    // V4 -> V5 Migration (Current week for leagues)
    if (userVersion < 5 && targetVersion >= 5) {
      console.log('Starting migration from v4 to v5...');
      db.transaction(() => {
        const leagueCols = db.pragma('table_info(leagues)').map(c => c.name);
        if (!leagueCols.includes('current_week')) {
          db.exec(`ALTER TABLE leagues ADD COLUMN current_week INTEGER DEFAULT 1`);
        }
        db.prepare('UPDATE leagues SET current_week = 3 WHERE current_week = 1').run();
        db.pragma('user_version = 5');
      })();
      userVersion = 5;
      console.log('Migration v5 applied successfully.');
    }

    // V5 -> V6 Migration (Course & Facility Management)
    if (userVersion < 6 && targetVersion >= 6) {
      console.log('Starting migration from v5 to v6...');
      db.transaction(() => {
        const courseCols = db.pragma('table_info(courses)').map(c => c.name);
        if (!courseCols.includes('logo_url')) db.exec(`ALTER TABLE courses ADD COLUMN logo_url TEXT`);
        if (!courseCols.includes('primary_color')) db.exec(`ALTER TABLE courses ADD COLUMN primary_color TEXT DEFAULT '#1d7a5f'`);
        if (!courseCols.includes('address')) db.exec(`ALTER TABLE courses ADD COLUMN address TEXT DEFAULT ''`);
        if (!courseCols.includes('city')) db.exec(`ALTER TABLE courses ADD COLUMN city TEXT DEFAULT ''`);
        if (!courseCols.includes('weather_lat')) db.exec(`ALTER TABLE courses ADD COLUMN weather_lat REAL`);
        if (!courseCols.includes('weather_lon')) db.exec(`ALTER TABLE courses ADD COLUMN weather_lon REAL`);
        if (!courseCols.includes('contact_email')) db.exec(`ALTER TABLE courses ADD COLUMN contact_email TEXT DEFAULT ''`);
        if (!courseCols.includes('contact_phone')) db.exec(`ALTER TABLE courses ADD COLUMN contact_phone TEXT DEFAULT ''`);
        if (!courseCols.includes('local_rules')) db.exec(`ALTER TABLE courses ADD COLUMN local_rules TEXT DEFAULT ''`);

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
          insertTee.run(c.id, 'Siyah (Championship)', '#1e293b', 'men', 74.2, 135, 6850, 6263);
          insertTee.run(c.id, 'Beyaz (Men)', '#f8fafc', 'men', 72.0, 128, 6400, 5852);
          insertTee.run(c.id, 'Gold (Senior)', '#eab308', 'all', 70.4, 122, 5950, 5440);
          insertTee.run(c.id, 'Red (Women)', '#ef4444', 'women', 68.8, 116, 5200, 4754);
        }

        db.pragma('user_version = 6');
      })();
      userVersion = 6;
      console.log('Migration v6 applied successfully.');
    }

    // V6 -> V7 Migration (Tournament & League Formats)
    if (userVersion < 7 && targetVersion >= 7) {
      console.log('Starting migration from v6 to v7...');
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
      userVersion = 7;
      console.log('Migration v7 applied successfully.');
    }

    // V7 -> V8 Migration (WHS Handicap & Audit Trail)
    if (userVersion < 8 && targetVersion >= 8) {
      console.log('Starting migration from v7 to v8...');
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

        db.prepare('UPDATE teams SET low_handicap_365 = current_handicap WHERE low_handicap_365 = 0.0').run();
        db.pragma('user_version = 8');
      })();
      userVersion = 8;
      console.log('Migration v8 applied successfully.');
    }

    // V8 -> V9 Migration (Fixture Engine, Substitutes & RSVPs)
    if (userVersion < 9 && targetVersion >= 9) {
      console.log('Starting migration from v8 to v9...');
      db.transaction(() => {
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
      userVersion = 9;
      console.log('Migration v9 applied successfully.');
    }

    // V9 -> V10 Migration (Hole-by-Hole Live Scoring, Attest & Stats)
    if (userVersion < 10 && targetVersion >= 10) {
      console.log('Starting migration from v9 to v10...');
      db.transaction(() => {
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
      userVersion = 10;
      console.log('Migration v10 applied successfully.');
    }

    // V10 -> V11 Migration (Player Profile, Badges, Bag & Notes)
    if (userVersion < 11 && targetVersion >= 11) {
      console.log('Starting migration from v10 to v11...');
      db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS player_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL UNIQUE,
            bio TEXT,
            avatar_url TEXT,
            favorite_club TEXT DEFAULT '7 Iron',
            handicap_goal REAL DEFAULT 5.0,
            theme_preference TEXT DEFAULT 'dark',
            language TEXT DEFAULT 'en',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(team_id) REFERENCES teams(id)
          );
          CREATE TABLE IF NOT EXISTS player_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            badge_key TEXT NOT NULL,
            badge_title TEXT NOT NULL,
            badge_icon TEXT NOT NULL,
            awarded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(team_id) REFERENCES teams(id)
          );
          CREATE TABLE IF NOT EXISTS player_bag_clubs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            club_name TEXT NOT NULL,
            brand TEXT,
            avg_distance_meters INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(team_id) REFERENCES teams(id)
          );
          CREATE TABLE IF NOT EXISTS round_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            week_number INTEGER NOT NULL,
            notes TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(team_id) REFERENCES teams(id)
          );
        `);

        const teams = db.prepare('SELECT id FROM teams').all();
        const insertProfile = db.prepare(`
          INSERT OR IGNORE INTO player_profiles (team_id, bio, favorite_club, handicap_goal, theme_preference, language)
          VALUES (?, '', '', NULL, 'light', 'en')
        `);
        for (const t of teams) {
          insertProfile.run(t.id);
        }

        db.pragma('user_version = 11');
      })();
      userVersion = 11;
      console.log('Migration v11 applied successfully.');
    }

    // V11 -> V12 Migration (Clubhouse TV & Digital Signage)
    if (userVersion < 12 && targetVersion >= 12) {
      console.log('Starting migration from v11 to v12...');
      db.transaction(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS tv_displays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            template_type TEXT DEFAULT 'leaderboard_ticker',
            auto_scroll_speed INTEGER DEFAULT 10,
            show_announcements BOOLEAN DEFAULT 1,
            announcement_text TEXT DEFAULT 'Welcome to Birvo! • Track live leaderboards and enter scores seamlessly on mobile.',
            celebration_effects BOOLEAN DEFAULT 1,
            sound_enabled BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(league_id) REFERENCES leagues(id)
          );
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

        const leagues = db.prepare("SELECT id FROM leagues WHERE status = 'active'").all();
        const insertTV = db.prepare(`
          INSERT OR IGNORE INTO tv_displays (league_id, name, template_type, auto_scroll_speed)
          VALUES (?, 'Clubhouse Main Screen', 'leaderboard_ticker', 8)
        `);
        for (const l of leagues) {
          insertTV.run(l.id);
        }

        db.pragma('user_version = 12');
      })();
      userVersion = 12;
      console.log('Migration v12 applied successfully.');
    }

    // V12 -> V13 Migration (Stripe SaaS, Coupons, Invoices & Entry Fees)
    if (userVersion < 13 && targetVersion >= 13) {
      console.log('Starting migration from v12 to v13...');
      db.transaction(() => {
        const courseCols = db.pragma('table_info(courses)').map(c => c.name);
        if (!courseCols.includes('subscription_plan')) {
          db.exec(`ALTER TABLE courses ADD COLUMN subscription_plan TEXT DEFAULT 'starter'`);
        }
        if (!courseCols.includes('currency')) {
          db.exec(`ALTER TABLE courses ADD COLUMN currency TEXT DEFAULT 'USD'`);
        }
        if (!courseCols.includes('trial_ends_at')) {
          db.exec(`ALTER TABLE courses ADD COLUMN trial_ends_at DATETIME`);
        }

        db.exec(`
          CREATE TABLE IF NOT EXISTS coupon_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            code TEXT NOT NULL UNIQUE,
            discount_type TEXT DEFAULT 'percent',
            discount_value REAL NOT NULL,
            max_uses INTEGER DEFAULT 100,
            used_count INTEGER DEFAULT 0,
            expires_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id)
          );
          CREATE TABLE IF NOT EXISTS billing_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            invoice_number TEXT NOT NULL UNIQUE,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            status TEXT DEFAULT 'draft',
            plan_name TEXT NOT NULL,
            period_start TEXT,
            period_end TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id)
          );
          CREATE TABLE IF NOT EXISTS tournament_entry_fees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            league_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            fee_amount REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            payment_status TEXT DEFAULT 'pending',
            paid_at DATETIME,
            FOREIGN KEY(league_id) REFERENCES leagues(id),
            FOREIGN KEY(team_id) REFERENCES teams(id)
          );
        `);

        db.pragma('user_version = 13');
      })();
      userVersion = 13;
      console.log('Migration v13 applied successfully.');
    }

    // V13 -> V14 Migration (Tenant Onboarding & Neutral Billing State)
    if (userVersion < 14 && targetVersion >= 14) {
      console.log('Starting migration from v13 to v14...');
      db.transaction(() => {
        const courseCols = db.pragma('table_info(courses)').map(c => c.name);
        if (!courseCols.includes('state')) db.exec(`ALTER TABLE courses ADD COLUMN state TEXT DEFAULT ''`);
        if (!courseCols.includes('postal_code')) db.exec(`ALTER TABLE courses ADD COLUMN postal_code TEXT DEFAULT ''`);
        if (!courseCols.includes('country_code')) db.exec(`ALTER TABLE courses ADD COLUMN country_code TEXT DEFAULT 'US'`);
        if (!courseCols.includes('timezone')) db.exec(`ALTER TABLE courses ADD COLUMN timezone TEXT DEFAULT 'America/New_York'`);
        if (!courseCols.includes('onboarding_completed_at')) db.exec(`ALTER TABLE courses ADD COLUMN onboarding_completed_at DATETIME`);

        const leagueCols = db.pragma('table_info(leagues)').map(c => c.name);
        if (!leagueCols.includes('season_length_weeks')) db.exec(`ALTER TABLE leagues ADD COLUMN season_length_weeks INTEGER DEFAULT 12`);

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_users_course_id ON users(course_id);
          CREATE INDEX IF NOT EXISTS idx_leagues_course_status ON leagues(course_id, status);
        `);

        db.prepare("UPDATE courses SET stripe_status = 'not_configured' WHERE stripe_status = 'active'").run();
        db.prepare("UPDATE courses SET subscription_plan = 'starter' WHERE subscription_plan IS NULL OR subscription_plan = 'pro_club'").run();
        db.prepare("DELETE FROM tv_sponsors WHERE name = 'Birvo Premium Partner' AND logo_url = '/golf-ball.png'").run();
        db.prepare("DELETE FROM coupon_codes WHERE code = 'BIRVO20' AND discount_type = 'percent' AND discount_value = 20.0").run();
        db.prepare("DELETE FROM billing_invoices WHERE invoice_number LIKE 'INV-2026-%-001' AND amount = 149.0 AND plan_name = 'Pro Club ($149/mo)'").run();
        db.prepare("UPDATE player_profiles SET language = 'en' WHERE language = 'tr'").run();

        db.pragma('user_version = 14');
      })();
      userVersion = 14;
      console.log('Migration v14 applied successfully.');
    }

    // V14 -> V15 Migration (Tenant Memberships, Invitations & Operational Safety)
    if (userVersion < 15 && targetVersion >= 15) {
      console.log('Starting migration from v14 to v15...');
      db.transaction(() => {
        const teamCols = db.pragma('table_info(teams)').map(c => c.name);
        if (!teamCols.includes('contact_email')) db.exec(`ALTER TABLE teams ADD COLUMN contact_email TEXT`);
        const matchCols = db.pragma('table_info(matches)').map(c => c.name);
        if (!matchCols.includes('locked_at')) db.exec(`ALTER TABLE matches ADD COLUMN locked_at DATETIME`);
        if (!matchCols.includes('locked_by_user_id')) db.exec(`ALTER TABLE matches ADD COLUMN locked_by_user_id TEXT`);
        if (!matchCols.includes('lock_reason')) db.exec(`ALTER TABLE matches ADD COLUMN lock_reason TEXT`);

        db.exec(`
          CREATE TABLE IF NOT EXISTS course_memberships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            email TEXT NOT NULL COLLATE NOCASE,
            role TEXT NOT NULL DEFAULT 'scorekeeper'
              CHECK(role IN ('superadmin', 'course_owner', 'course_admin', 'admin', 'assistant_admin', 'scorekeeper')),
            status TEXT NOT NULL DEFAULT 'active'
              CHECK(status IN ('active', 'suspended', 'removed')),
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            UNIQUE(course_id, user_id)
          );

          CREATE TABLE IF NOT EXISTS course_invitations (
            id TEXT PRIMARY KEY,
            course_id INTEGER NOT NULL,
            email TEXT NOT NULL COLLATE NOCASE,
            role TEXT NOT NULL DEFAULT 'scorekeeper'
              CHECK(role IN ('course_admin', 'admin', 'assistant_admin', 'scorekeeper')),
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending', 'accepted', 'revoked', 'expired', 'failed')),
            invited_by_user_id TEXT NOT NULL,
            auth_user_id TEXT,
            external_invitation_sent_at DATETIME,
            expires_at DATETIME NOT NULL,
            accepted_at DATETIME,
            revoked_at DATETIME,
            last_error TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER,
            actor_user_id TEXT,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE SET NULL
          );

          CREATE TABLE IF NOT EXISTS public_link_revocations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER NOT NULL,
            league_id INTEGER NOT NULL,
            purpose TEXT NOT NULL CHECK(purpose IN ('standings', 'tv', 'player')),
            token_hash TEXT NOT NULL UNIQUE,
            revoked_by_user_id TEXT NOT NULL,
            expires_at DATETIME,
            revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY(league_id) REFERENCES leagues(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS public_link_settings (
            course_id INTEGER NOT NULL,
            league_id INTEGER NOT NULL,
            purpose TEXT NOT NULL CHECK(purpose IN ('standings', 'tv', 'player')),
            token_version INTEGER NOT NULL DEFAULT 1 CHECK(token_version >= 1),
            rotated_by_user_id TEXT,
            rotated_at DATETIME,
            PRIMARY KEY(league_id, purpose),
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY(league_id) REFERENCES leagues(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS rate_limit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scope TEXT NOT NULL,
            subject_hash TEXT NOT NULL,
            occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS course_setup_steps (
            course_id INTEGER NOT NULL,
            step_key TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending', 'in_progress', 'complete', 'blocked')),
            completed_by_user_id TEXT,
            completed_at DATETIME,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY(course_id, step_key),
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS roster_imports (
            id TEXT PRIMARY KEY,
            course_id INTEGER NOT NULL,
            league_id INTEGER NOT NULL,
            uploaded_by_user_id TEXT NOT NULL,
            source_name TEXT,
            status TEXT NOT NULL DEFAULT 'preview'
              CHECK(status IN ('preview', 'committed', 'cancelled', 'failed')),
            total_rows INTEGER NOT NULL DEFAULT 0,
            valid_rows INTEGER NOT NULL DEFAULT 0,
            invalid_rows INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            committed_at DATETIME,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY(league_id) REFERENCES leagues(id) ON DELETE CASCADE
          );

          CREATE TABLE IF NOT EXISTS roster_import_rows (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_id TEXT NOT NULL,
            row_number INTEGER NOT NULL,
            raw_json TEXT NOT NULL,
            normalized_name TEXT,
            normalized_email TEXT,
            handicap REAL,
            validation_status TEXT NOT NULL CHECK(validation_status IN ('valid', 'invalid', 'duplicate')),
            validation_message TEXT,
            created_team_id INTEGER,
            FOREIGN KEY(import_id) REFERENCES roster_imports(id) ON DELETE CASCADE,
            FOREIGN KEY(created_team_id) REFERENCES teams(id) ON DELETE SET NULL,
            UNIQUE(import_id, row_number)
          );

          CREATE TABLE IF NOT EXISTS score_correction_requests (
            id TEXT PRIMARY KEY,
            course_id INTEGER NOT NULL,
            score_id INTEGER NOT NULL,
            requested_by_user_id TEXT NOT NULL,
            requested_gross_score INTEGER NOT NULL CHECK(requested_gross_score BETWEEN 1 AND 200),
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending'
              CHECK(status IN ('pending', 'approved', 'rejected', 'cancelled')),
            reviewed_by_user_id TEXT,
            review_note TEXT,
            reviewed_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
            FOREIGN KEY(score_id) REFERENCES scores(id) ON DELETE CASCADE
          );

          CREATE UNIQUE INDEX IF NOT EXISTS idx_course_invitations_pending
            ON course_invitations(course_id, email) WHERE status = 'pending';
          CREATE INDEX IF NOT EXISTS idx_course_memberships_user_status
            ON course_memberships(user_id, status);
          CREATE INDEX IF NOT EXISTS idx_course_memberships_course_status
            ON course_memberships(course_id, status);
          CREATE INDEX IF NOT EXISTS idx_audit_events_course_created
            ON audit_events(course_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_rate_limit_subject_window
            ON rate_limit_events(scope, subject_hash, occurred_at);
          CREATE INDEX IF NOT EXISTS idx_correction_requests_course_status
            ON score_correction_requests(course_id, status, created_at DESC);
        `);

        db.exec(`
          INSERT OR IGNORE INTO course_memberships (course_id, user_id, email, role, status, joined_at)
          SELECT course_id, id, email,
            CASE
              WHEN role IN ('superadmin', 'course_owner', 'course_admin', 'admin', 'assistant_admin', 'scorekeeper') THEN role
              ELSE 'scorekeeper'
            END,
            'active', created_at
          FROM users
          WHERE course_id IS NOT NULL;

          INSERT OR IGNORE INTO course_setup_steps (course_id, step_key, status, completed_at)
          SELECT id, 'course_profile',
            CASE WHEN TRIM(COALESCE(name, '')) <> '' THEN 'complete' ELSE 'pending' END,
            CASE WHEN TRIM(COALESCE(name, '')) <> '' THEN CURRENT_TIMESTAMP ELSE NULL END
          FROM courses;
          INSERT OR IGNORE INTO course_setup_steps (course_id, step_key, status, completed_at)
          SELECT c.id, 'course_layout',
            CASE WHEN (SELECT COUNT(*) FROM course_holes h WHERE h.course_id = c.id) IN (9, 18) THEN 'complete' ELSE 'pending' END,
            CASE WHEN (SELECT COUNT(*) FROM course_holes h WHERE h.course_id = c.id) IN (9, 18) THEN CURRENT_TIMESTAMP ELSE NULL END
          FROM courses c;
          INSERT OR IGNORE INTO course_setup_steps (course_id, step_key, status, completed_at)
          SELECT c.id, 'tee_boxes',
            CASE WHEN EXISTS(SELECT 1 FROM course_tee_boxes t WHERE t.course_id = c.id) THEN 'complete' ELSE 'pending' END,
            CASE WHEN EXISTS(SELECT 1 FROM course_tee_boxes t WHERE t.course_id = c.id) THEN CURRENT_TIMESTAMP ELSE NULL END
          FROM courses c;
          INSERT OR IGNORE INTO course_setup_steps (course_id, step_key, status, completed_at)
          SELECT c.id, 'first_league',
            CASE WHEN EXISTS(SELECT 1 FROM leagues l WHERE l.course_id = c.id) THEN 'complete' ELSE 'pending' END,
            CASE WHEN EXISTS(SELECT 1 FROM leagues l WHERE l.course_id = c.id) THEN CURRENT_TIMESTAMP ELSE NULL END
          FROM courses c;
          INSERT OR IGNORE INTO course_setup_steps (course_id, step_key, status)
          SELECT id, 'roster', 'pending' FROM courses;
          INSERT OR IGNORE INTO course_setup_steps (course_id, step_key, status)
          SELECT id, 'scoring_ready', 'pending' FROM courses;
        `);

        db.pragma('user_version = 15');
      })();
      userVersion = 15;
      console.log('Migration v15 applied successfully.');
    }

    // V15 -> V16 Migration (US customary distance naming)
    if (userVersion < 16 && targetVersion >= 16) {
      console.log('Starting migration from v15 to v16...');
      db.transaction(() => {
        const tables = db.pragma('table_list').filter(item => item.type === 'table').map(item => item.name);
        if (tables.includes('player_bag_clubs')) {
          const clubColumns = db.pragma('table_info(player_bag_clubs)').map(item => item.name);
          if (!clubColumns.includes('avg_distance_yards')) {
            db.exec('ALTER TABLE player_bag_clubs ADD COLUMN avg_distance_yards INTEGER CHECK(avg_distance_yards BETWEEN 0 AND 450)');
          }
          if (clubColumns.includes('avg_distance_meters')) {
            // Historical UI values were already entered and displayed as yards despite the legacy column name.
            db.exec('UPDATE player_bag_clubs SET avg_distance_yards = avg_distance_meters WHERE avg_distance_yards IS NULL');
          }
        }
        db.pragma('user_version = 16');
      })();
      userVersion = 16;
      console.log('Migration v16 applied successfully.');
    }

    // V16 -> V17 Migration (explicit ghost-score provenance)
    if (userVersion < 17 && targetVersion >= 17) {
      console.log('Starting migration from v16 to v17...');
      db.transaction(() => {
        const tables = db.pragma('table_list').filter(item => item.type === 'table').map(item => item.name);
        if (tables.includes('scores')) {
          const scoreColumns = db.pragma('table_info(scores)').map(item => item.name);
          if (!scoreColumns.includes('is_ghost')) {
            db.exec('ALTER TABLE scores ADD COLUMN is_ghost INTEGER NOT NULL DEFAULT 0 CHECK(is_ghost IN (0,1))');
          }
          db.exec('CREATE INDEX IF NOT EXISTS idx_scores_match_ghost ON scores(match_id, is_ghost)');
        }
        db.pragma('user_version = 17');
      })();
      userVersion = 17;
      console.log('Migration v17 applied successfully.');
    }

  } finally {
    db.pragma(`foreign_keys = ${originalFk ? 'ON' : 'OFF'}`);
  }

  return { status: 'success', currentVersion: userVersion };
}

module.exports = { runMigrations };
