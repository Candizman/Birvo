const path = require('path');
const { createDatabase } = require('../lib/database/createDatabase');
const { runMigrations } = require('../lib/database/migrations');
const { calculateLeaguePoints, calculateSeasonStandings } = require('../lib/domain/scoring');

const dbPath = path.join(process.cwd(), 'birvo.db');
const db = createDatabase(dbPath);

// Ensure full migrations are up to date
runMigrations(db, 13);

const forceSeed = process.argv.includes('--force');

db.transaction(() => {
  const courseCount = db.prepare('SELECT COUNT(*) as count FROM courses').get().count;
  if (courseCount > 0 && !forceSeed) {
    console.log('Database already has data. Use --force to re-seed.');
    return;
  }

  if (forceSeed) {
    console.log('Resetting and seeding rich US demo dataset...');
    db.exec(`
      DELETE FROM billing_invoices;
      DELETE FROM coupon_codes;
      DELETE FROM tournament_entry_fees;
      DELETE FROM tv_sponsors;
      DELETE FROM tv_displays;
      DELETE FROM round_notes;
      DELETE FROM player_bag_clubs;
      DELETE FROM player_badges;
      DELETE FROM player_profiles;
      DELETE FROM score_audit_logs;
      DELETE FROM score_hole_details;
      DELETE FROM handicap_audit_logs;
      DELETE FROM scores;
      DELETE FROM matches;
      DELETE FROM match_fixtures;
      DELETE FROM substitutes;
      DELETE FROM player_rsvps;
      DELETE FROM tee_times;
      DELETE FROM course_tee_boxes;
      DELETE FROM course_holes;
      DELETE FROM teams;
      DELETE FROM leagues;
      DELETE FROM users;
      DELETE FROM courses;
    `);
  }

  // 1. Create Course: Pebble Beach Golf Links
  const courseId = db.prepare(`
    INSERT INTO courses (name, city, address, contact_email, contact_phone, primary_color, subscription_plan, stripe_status, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Pebble Beach Golf Links',
    'Pebble Beach, CA',
    '1700 17-Mile Drive',
    'proshop@pebblebeachgolf.com',
    '+1 (800) 877-0597',
    '#d4af37',
    'pro_club',
    'active',
    'USD'
  ).lastInsertRowid;

  // 2. Insert 18 USGA Championship Holes
  const holeData = [
    { num: 1, par: 4, si: 8, pin: 'center' },
    { num: 2, par: 5, si: 2, pin: 'front' },
    { num: 3, par: 4, si: 12, pin: 'right' },
    { num: 4, par: 4, si: 16, pin: 'center' },
    { num: 5, par: 3, si: 14, pin: 'back' },
    { num: 6, par: 5, si: 4, pin: 'left' },
    { num: 7, par: 3, si: 18, pin: 'front' }, // Famous 106-yd Par 3
    { num: 8, par: 4, si: 6, pin: 'center' },
    { num: 9, par: 4, si: 10, pin: 'back' },
    { num: 10, par: 4, si: 7, pin: 'center' },
    { num: 11, par: 4, si: 5, pin: 'left' },
    { num: 12, par: 3, si: 17, pin: 'front' },
    { num: 13, par: 4, si: 9, pin: 'center' },
    { num: 14, par: 5, si: 1, pin: 'back' }, // Toughest hole
    { num: 15, par: 4, si: 13, pin: 'right' },
    { num: 16, par: 4, si: 11, pin: 'center' },
    { num: 17, par: 3, si: 15, pin: 'left' },
    { num: 18, par: 5, si: 3, pin: 'back' }  // Iconic ocean finishing hole
  ];

  const insertHole = db.prepare(`
    INSERT INTO course_holes (course_id, hole_number, par, stroke_index, pin_position, is_under_maintenance)
    VALUES (?, ?, ?, ?, ?, 0)
  `);
  holeData.forEach(h => insertHole.run(courseId, h.num, h.par, h.si, h.pin));

  // 3. Insert 4 Official USGA Tee Boxes
  const insertTee = db.prepare(`
    INSERT INTO course_tee_boxes (course_id, name, color_hex, gender, course_rating, slope_rating, total_yards, total_meters)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTee.run(courseId, 'Black (Championship)', '#0f172a', 'men', 75.5, 145, 7075, 6469);
  insertTee.run(courseId, 'White (Men / Regular)', '#ffffff', 'men', 72.8, 136, 6416, 5867);
  insertTee.run(courseId, 'Gold (Senior)', '#eab308', 'men', 70.1, 128, 5945, 5436);
  insertTee.run(courseId, 'Red (Women)', '#ef4444', 'women', 73.2, 130, 5212, 4766);

  // 4. Create Users / Staff
  const insertUser = db.prepare(`
    INSERT INTO users (id, email, role, course_id)
    VALUES (?, ?, ?, ?)
  `);
  insertUser.run('00000000-0000-0000-0000-000000000000', 'admin@birvo.com', 'course_admin', courseId);
  insertUser.run('staff-001', 'proshop@pebblebeachgolf.com', 'scorekeeper', courseId);
  insertUser.run('staff-002', 'director@pebblebeachgolf.com', 'course_admin', courseId);

  // 5. Create League: 2026 Pebble Beach Spring Invitational
  const leagueId = db.prepare(`
    INSERT INTO leagues (course_id, name, game_format, status, current_week)
    VALUES (?, ?, ?, ?, ?)
  `).run(courseId, '2026 Pebble Beach Spring Invitational', 'stroke_play', 'active', 3).lastInsertRowid;

  // 6. Create 8 Competitive US Teams
  const teams = [
    { name: 'Monterey Albatrosses', handicap: 2.4, pin: '1001' },
    { name: 'Pacific Dunes Birdies', handicap: 5.2, pin: '1002' },
    { name: 'Carmel Bay Fairways', handicap: 7.8, pin: '1003' },
    { name: 'Cypress Point Drivers', handicap: 10.5, pin: '1004' },
    { name: 'Spyglass Putters', handicap: 13.6, pin: '1005' },
    { name: '17-Mile Eagles', handicap: 16.2, pin: '1006' },
    { name: 'Lone Cypress Pars', handicap: 18.8, pin: '1007' },
    { name: 'Bay Iron Masters', handicap: 21.5, pin: '1008' }
  ];

  const teamIds = [];
  const insertTeam = db.prepare(`
    INSERT INTO teams (league_id, name, current_handicap, pin, status)
    VALUES (?, ?, ?, ?, 'active')
  `);

  teams.forEach(t => {
    const id = insertTeam.run(leagueId, t.name, t.handicap, t.pin).lastInsertRowid;
    teamIds.push({ id, ...t });

    // Profile
    db.prepare(`
      INSERT INTO player_profiles (team_id, bio, favorite_club, handicap_goal, theme_preference, language)
      VALUES (?, ?, ?, ?, 'dark', 'en')
    `).run(id, `${t.name} Captain & Member at Pebble Beach Golf Links`, 'Titleist TSR3 Driver', Math.max(0, t.handicap - 2.0));

    // Clubs in Bag
    db.prepare(`INSERT INTO player_bag_clubs (team_id, club_name, brand, avg_distance_yards) VALUES (?, 'Driver', 'Titleist TSR3', 285)`).run(id);
    db.prepare(`INSERT INTO player_bag_clubs (team_id, club_name, brand, avg_distance_yards) VALUES (?, '3 Wood', 'TaylorMade Qi10', 250)`).run(id);
    db.prepare(`INSERT INTO player_bag_clubs (team_id, club_name, brand, avg_distance_yards) VALUES (?, '7 Iron', 'Mizuno Pro 241', 170)`).run(id);
    db.prepare(`INSERT INTO player_bag_clubs (team_id, club_name, brand, avg_distance_yards) VALUES (?, 'Putter', 'Scotty Cameron Phantom X', 0)`).run(id);

    // Badges
    db.prepare(`INSERT INTO player_badges (team_id, badge_key, badge_title, badge_icon) VALUES (?, 'season_opener', 'Season Opener', '⛳')`).run(id);
  });

  // 7. Generate 3 Rounds of Completed Matches & Scores
  const insertMatch = db.prepare('INSERT INTO matches (league_id, week_number, status) VALUES (?, ?, ?)');
  const insertScore = db.prepare(`
    INSERT INTO scores (match_id, team_id, gross_score, handicap_used, net_score, reconciliation_status, attestation_status)
    VALUES (?, ?, ?, ?, ?, 'ok', 'attested')
  `);
  const insertHoleScore = db.prepare(`
    INSERT INTO score_hole_details (score_id, hole_number, gross_score, putts, fairway_hit, gir, sand_saves)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const weeklyScoreData = [
    // Week 1
    [
      { tIdx: 0, gross: 72 }, { tIdx: 1, gross: 76 }, { tIdx: 2, gross: 79 }, { tIdx: 3, gross: 82 },
      { tIdx: 4, gross: 85 }, { tIdx: 5, gross: 88 }, { tIdx: 6, gross: 91 }, { tIdx: 7, gross: 95 }
    ],
    // Week 2
    [
      { tIdx: 0, gross: 71 }, { tIdx: 1, gross: 74 }, { tIdx: 2, gross: 78 }, { tIdx: 3, gross: 80 },
      { tIdx: 4, gross: 84 }, { tIdx: 5, gross: 86 }, { tIdx: 6, gross: 89 }, { tIdx: 7, gross: 92 }
    ],
    // Week 3 (Current Week)
    [
      { tIdx: 0, gross: 70 }, { tIdx: 1, gross: 75 }, { tIdx: 2, gross: 77 }, { tIdx: 3, gross: 81 },
      { tIdx: 4, gross: 83 }, { tIdx: 5, gross: 87 }, { tIdx: 6, gross: 90 }, { tIdx: 7, gross: 94 }
    ]
  ];

  weeklyScoreData.forEach((weekScores, wIdx) => {
    const weekNum = wIdx + 1;
    const matchId = insertMatch.run(leagueId, weekNum, 'completed').lastInsertRowid;

    weekScores.forEach(entry => {
      const team = teamIds[entry.tIdx];
      const net = Number((entry.gross - team.handicap).toFixed(1));
      const scoreId = insertScore.run(matchId, team.id, entry.gross, team.handicap, net).lastInsertRowid;

      // 18 hole details
      for (let h = 1; h <= 18; h++) {
        const par = holeData[h - 1].par;
        const diff = (entry.gross / 18) - par;
        const holeGross = Math.round(par + (diff > 0.5 ? 1 : 0));
        insertHoleScore.run(scoreId, h, holeGross, 2, 1, 1, 0);
      }

      // Add round notes
      db.prepare(`
        INSERT INTO round_notes (team_id, week_number, notes)
        VALUES (?, ?, ?)
      `).run(team.id, weekNum, `Week ${weekNum}: Solid ball striking, greens rolling true at 12 on the Stimp.`);
    });
  });

  // 8. Clubhouse TV & Official Sponsors
  const tvId = db.prepare(`
    INSERT INTO tv_displays (league_id, name, template_type, auto_scroll_speed, show_announcements, announcement_text, celebration_effects, sound_enabled)
    VALUES (?, ?, ?, ?, 1, ?, 1, 1)
  `).run(
    leagueId,
    'Pebble Beach Clubhouse TV 1',
    'leaderboard_ticker',
    8,
    'Welcome to the 2026 Pebble Beach Spring Invitational! • Live hole-by-hole scores updated dynamically.'
  ).lastInsertRowid;

  const insertSponsor = db.prepare(`
    INSERT INTO tv_sponsors (league_id, name, logo_url, display_order, active)
    VALUES (?, ?, ?, ?, 1)
  `);
  insertSponsor.run(leagueId, 'Rolex Watch USA', '/golf-ball.png', 1);
  insertSponsor.run(leagueId, 'Titleist Golf Equipment', '/golf-ball.png', 2);
  insertSponsor.run(leagueId, 'TaylorMade Qi10 Series', '/golf-ball.png', 3);
  insertSponsor.run(leagueId, 'Callaway Golf Pre-Owned', '/golf-ball.png', 4);

  // 9. Billing, Invoices & Coupon
  db.prepare(`
    INSERT INTO billing_invoices (course_id, invoice_number, amount, currency, status, plan_name, period_start, period_end)
    VALUES (?, 'INV-2026-PB-001', 149.00, 'USD', 'paid', 'Pro Club ($149/mo)', '2026-08-01', '2026-09-01')
  `).run(courseId);

  db.prepare(`
    INSERT INTO coupon_codes (course_id, code, discount_type, discount_value, max_uses, used_count)
    VALUES (?, 'PEBBLE20', 'percent', 20.0, 50, 4)
  `).run(courseId);

  // 10. Substitutes Pool & Shotgun Schedule
  db.prepare(`
    INSERT INTO substitutes (league_id, name, handicap, phone, email, status)
    VALUES (?, 'Jack Nicklaus Jr.', 1.8, '+1 (415) 555-0192', 'jack@golfpro.com', 'available')
  `).run(leagueId);

  db.prepare(`
    INSERT INTO substitutes (league_id, name, handicap, phone, email, status)
    VALUES (?, 'Arnold Palmer III', 4.5, '+1 (415) 555-0198', 'arnie@golfpro.com', 'available')
  `).run(leagueId);

  console.log(`✅ Demo database successfully seeded:`);
  console.log(`   - Course: Pebble Beach Golf Links (18 holes, 4 USGA tees)`);
  console.log(`   - League: 2026 Pebble Beach Spring Invitational (8 teams, 3 rounds)`);
  console.log(`   - Clubhouse TV: 4 official sponsors & live marquee`);
  console.log(`   - Billing: Pro Club subscription with active Stripe status`);
})();
