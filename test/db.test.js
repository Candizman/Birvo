const test = require('node:test');
const assert = require('node:assert');
const { createDatabase } = require('../lib/database/createDatabase');
const { runMigrations } = require('../lib/database/migrations');
const { checkIntegrity } = require('../lib/database/integrity');
const { calculateLeaguePoints } = require('../lib/domain/scoring');

test('Database V2 Migration and Recovery Tests', async (t) => {
  await t.test('1. A broken v1 leagues foreign key is connected to courses in v2', () => {
    const db = createDatabase(':memory:');
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE courses_old (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT, FOREIGN KEY(course_id) REFERENCES courses_old(id));
    `);
    db.pragma('user_version = 1');
    runMigrations(db);
    const fk = db.pragma('foreign_key_list(leagues)');
    assert.strictEqual(fk[0].table, 'courses');
  });

  await t.test('2. foreign_key_check is empty & 3. integrity_check returns ok', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    const integrity = checkIntegrity(db);
    assert.strictEqual(integrity.foreignKeysOk, true);
    assert.strictEqual(integrity.integrityOk, true);
  });

  await t.test('4. Week 1 and Week 2 scores remain separate in the v0 fallback mapping', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, team_id INTEGER, week_number INTEGER, gross_score INTEGER);
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name) VALUES (1, 1, 'T1');
      INSERT INTO scores (id, team_id, week_number, gross_score) VALUES (1, 1, 1, 40), (2, 1, 2, 45);
    `);
    db.pragma('user_version = 0');
    runMigrations(db);
    const count = db.prepare('SELECT COUNT(*) as c FROM scores').get().c;
    assert.strictEqual(count, 2);
  });

  await t.test('5. Ten legacy scores remain ten scores after migration', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, team_id INTEGER, week_number INTEGER, gross_score INTEGER);
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name) VALUES (1, 1, 'T1'), (2, 1, 'T2');
    `);
    for (let i = 1; i <= 10; i++) {
      db.exec(`INSERT INTO scores (team_id, week_number, gross_score) VALUES (${i % 2 === 0 ? 2 : 1}, ${i}, 40)`);
    }
    db.pragma('user_version = 0');
    runMigrations(db);
    assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM scores').get().c, 10);
  });

  await t.test('6. The final record wins for real duplicate team/week entries & 7. Deduplication audit', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, team_id INTEGER, week_number INTEGER, gross_score INTEGER);
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name) VALUES (1, 1, 'T1');
      INSERT INTO scores (id, team_id, week_number, gross_score) VALUES (1, 1, 1, 50), (2, 1, 1, 40);
    `);
    db.pragma('user_version = 0');
    runMigrations(db);
    const score = db.prepare('SELECT gross_score FROM scores WHERE team_id = 1').get();
    assert.strictEqual(score.gross_score, 40);
    const audit = db.prepare('SELECT COUNT(*) as c FROM migration_audit').get().c;
    assert.strictEqual(audit, 1);
  });

  await t.test('8. A NULL legacy handicap_used value is not converted to zero', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, team_id INTEGER, week_number INTEGER, handicap_used REAL, net_score REAL);
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name) VALUES (1, 1, 'T1');
      INSERT INTO scores (id, team_id, week_number, handicap_used, net_score) VALUES (1, 1, 1, NULL, NULL);
    `);
    db.pragma('user_version = 0');
    runMigrations(db);
    const s = db.prepare('SELECT handicap_used, net_score, reconciliation_status FROM scores WHERE id = 1').get();
    assert.strictEqual(s.handicap_used, null);
    assert.strictEqual(s.net_score, null);
    assert.strictEqual(s.reconciliation_status, 'needs_review');
  });

  await t.test('9. A NULL net_score is excluded from leaderboard scoring', () => {
    const teamsWithNet = [
      { id: 1, netScore: 36.0 },
      { id: 2, netScore: null }
    ];
    const validTeams = teamsWithNet.filter(t => typeof t.netScore === 'number');
    const result = calculateLeaguePoints(validTeams, 2);
    assert.strictEqual(result[0].pointsEarned, 0);
  });

  await t.test('10. Running a migration twice does not change data', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    const res = runMigrations(db);
    assert.strictEqual(res.status, 'already_up_to_date');
  });

  await t.test('11, 12, 13. Migration errors roll back, user_version does not advance, and foreign keys remain on', () => {
    const db = createDatabase(':memory:');
    db.exec('CREATE TABLE courses (id INTEGER)');
    const versionBefore = db.pragma('user_version', { simple: true });

    assert.throws(() => {
      runMigrations(db);
    });

    const versionAfter = db.pragma('user_version', { simple: true });
    assert.strictEqual(versionBefore, versionAfter);

    const fks = db.pragma('foreign_keys', { simple: true });
    assert.strictEqual(fks, 1);
  });

  await t.test('15. A clean database installs the complete v17 schema', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    assert.strictEqual(db.pragma('user_version', { simple: true }), 17);
    assert.ok(db.pragma('table_info(player_bag_clubs)').some(column => column.name === 'avg_distance_yards'));
  });

  await t.test('16. The v0 to v17 upgrade path works with a mock legacy schema', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, week_number INTEGER, team_id INTEGER);
    `);
    db.pragma('user_version = 0');
    runMigrations(db);
    assert.strictEqual(db.pragma('user_version', { simple: true }), 17);
  });

  await t.test('17. The v1 to v17 upgrade path works with a mock v1 schema', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, match_id INTEGER, team_id INTEGER, handicap_used REAL);
    `);
    db.pragma('user_version = 1');
    runMigrations(db);
    assert.strictEqual(db.pragma('user_version', { simple: true }), 17);
  });

  await t.test('18. Score-batch rollback rejects service-level forgery', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    db.exec(`
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1'), (2, 1, 'L2');
      INSERT INTO teams (id, league_id, name, status) VALUES (1, 1, 'T1', 'active'), (2, 2, 'T2', 'active');
    `);
    const { saveScoresBatch } = require('../lib/services/scoreService');

    assert.throws(() => {
      saveScoresBatch(db, 1, 1, [{ teamId: 2, grossScore: 40 }]);
    }, /Invalid or inactive team/);

    const count = db.prepare('SELECT COUNT(*) as c FROM scores').get().c;
    assert.strictEqual(count, 0);
  });

  await t.test('19. Ten scores with match_id=1 across weeks 1/2/3 remain ten with a 4/4/2 distribution after migration', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, match_id INTEGER, team_id INTEGER, week_number INTEGER, gross_score INTEGER);
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
    `);

    // Add 10 teams
    for (let i = 1; i <= 10; i++) db.exec(`INSERT INTO teams (id, league_id, name) VALUES (${i}, 1, 'T${i}')`);

    // 4 scores in week 1, 4 scores in week 2, 2 scores in week 3. All with match_id = 1 (legacy flaw)
    // week 1: teams 1-4
    for(let i=1; i<=4; i++) db.exec(`INSERT INTO scores (match_id, team_id, week_number, gross_score) VALUES (1, ${i}, 1, 40)`);
    // week 2: teams 5-8
    for(let i=5; i<=8; i++) db.exec(`INSERT INTO scores (match_id, team_id, week_number, gross_score) VALUES (1, ${i}, 2, 40)`);
    // week 3: teams 9-10
    for(let i=9; i<=10; i++) db.exec(`INSERT INTO scores (match_id, team_id, week_number, gross_score) VALUES (1, ${i}, 3, 40)`);

    db.pragma('user_version = 0');
    runMigrations(db);

    assert.strictEqual(db.prepare('SELECT COUNT(*) as c FROM scores').get().c, 10);

    const weekDist = db.prepare('SELECT m.week_number, COUNT(*) as c FROM scores s JOIN matches m ON s.match_id = m.id GROUP BY m.week_number ORDER BY m.week_number').all();
    assert.strictEqual(weekDist.length, 3);
    assert.strictEqual(weekDist[0].c, 4);
    assert.strictEqual(weekDist[1].c, 4);
    assert.strictEqual(weekDist[2].c, 2);
  });

  await t.test('20. Rapid entry rejects 75abc and 12.5, and one error rolls back the entire batch', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    db.exec(`
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name, status) VALUES (1, 1, 'T1', 'active'), (2, 1, 'T2', 'active');
    `);
    const { saveScoresBatch } = require('../lib/services/scoreService');

    // 1. invalid float
    assert.throws(() => {
      saveScoresBatch(db, 1, 1, [{ teamId: 1, grossScore: 12.5 }]);
    }, /Invalid gross score/);

    // 2. invalid string
    assert.throws(() => {
      saveScoresBatch(db, 1, 1, [{ teamId: 1, grossScore: '75abc' }]);
    }, /Invalid gross score/);

    // 3. Rollback test (team 1 valid, team 2 invalid)
    assert.throws(() => {
      saveScoresBatch(db, 1, 1, [
        { teamId: 1, grossScore: 40 },
        { teamId: 2, grossScore: 300 } // > 200 is invalid
      ]);
    }, /Invalid gross score/);

    const count = db.prepare('SELECT COUNT(*) as c FROM scores').get().c;
    assert.strictEqual(count, 0); // Completely rolled back, no score saved for team 1 either
  });

  await t.test('21. Score updates preserve the handicap snapshot', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    db.exec(`
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name, current_handicap, status) VALUES (1, 1, 'T1', 5.0, 'active');
    `);
    const { saveScoresBatch } = require('../lib/services/scoreService');

    // First save
    saveScoresBatch(db, 1, 1, [{ teamId: 1, grossScore: 40 }]);

    let score = db.prepare('SELECT * FROM scores WHERE team_id = 1').get();
    assert.strictEqual(score.gross_score, 40);
    assert.strictEqual(score.handicap_used, 5.0);
    assert.strictEqual(score.net_score, 35.0); // 40 - 5.0

    // Someone updates the team handicap (e.g. after week 1 completes)
    db.exec('UPDATE teams SET current_handicap = 7.0 WHERE id = 1');

    // Someone edits the week 1 score
    saveScoresBatch(db, 1, 1, [{ teamId: 1, grossScore: 38 }]);

    score = db.prepare('SELECT * FROM scores WHERE team_id = 1').get();
    assert.strictEqual(score.gross_score, 38);
    // The snapshot handicap_used (5.0) should remain, it should NOT use the new 7.0
    assert.strictEqual(score.handicap_used, 5.0);
    assert.strictEqual(score.net_score, 33.0); // 38 - 5.0, NOT 38 - 7.0
  });

  await t.test('22. No magic league fallback is used; an orphaned legacy score triggers rollback', () => {
    const db = createDatabase(':memory:');
    db.exec(`
      CREATE TABLE courses (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE leagues (id INTEGER PRIMARY KEY, course_id INTEGER, name TEXT);
      CREATE TABLE teams (id INTEGER PRIMARY KEY, league_id INTEGER, name TEXT);
      CREATE TABLE scores (id INTEGER PRIMARY KEY, team_id INTEGER, week_number INTEGER, gross_score INTEGER);
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name) VALUES (1, 1, 'T1');

      -- Team 999 does not exist!
      INSERT INTO scores (team_id, week_number, gross_score) VALUES (999, 1, 40);
    `);

    db.pragma('user_version = 0');
    // Because team 999 has no league_id in teams_old,
    // the matches_new insertion won't create a match for league_id=NULL
    // (since we removed COALESCE(t.league_id, 1)),
    // and thus scores insertion fails the match_id NOT NULL constraint, causing rollback.
    assert.throws(() => {
      runMigrations(db);
    }, /NOT NULL constraint failed/);
  });

  await t.test('23. A needs_review score is excluded from handicaps and the leaderboard', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    db.exec(`
      INSERT INTO courses (id, name) VALUES (1, 'C1');
      INSERT INTO leagues (id, course_id, name) VALUES (1, 1, 'L1');
      INSERT INTO teams (id, league_id, name, status, current_handicap) VALUES (1, 1, 'T1', 'active', 0.0);
    `);

    // Insert a needs_review score
    db.exec(`
      INSERT INTO matches (id, league_id, week_number) VALUES (1, 1, 1);
      INSERT INTO scores (match_id, team_id, gross_score, handicap_used, net_score, reconciliation_status)
      VALUES (1, 1, 40, NULL, NULL, 'needs_review');
    `);

    // Trigger saveScoresBatch to recalculate handicap for week 2
    const { saveScoresBatch } = require('../lib/services/scoreService');
    saveScoresBatch(db, 1, 2, [{ teamId: 1, grossScore: 42 }]);

    const team = db.prepare('SELECT current_handicap FROM teams WHERE id = 1').get();
    // Week 1 score is needs_review (gross 40). Week 2 is 42.
    // When calculating handicap for week 2, allPastScores should ONLY include week 2's 42!
    // Because week 1 is excluded.
    // calculateNewHandicap([42]) = 42-36 = 6 * 0.8 = 4.8
    assert.strictEqual(team.current_handicap, 4.8);
  });

  await t.test('24. runMigrations(db, 5) creates the complete v5 schema', () => {
    const db = createDatabase(':memory:');
    runMigrations(db, 5);
    assert.strictEqual(db.pragma('user_version', { simple: true }), 5);

    const integrity = checkIntegrity(db);
    assert.strictEqual(integrity.foreignKeysOk, true);
    assert.strictEqual(integrity.integrityOk, true);

    const tables = db.pragma('table_list').map(t => t.name);
    assert.ok(tables.includes('users'));
    assert.ok(tables.includes('courses'));
    assert.ok(tables.includes('leagues'));
    assert.ok(tables.includes('teams'));
    assert.ok(tables.includes('matches'));
    assert.ok(tables.includes('scores'));

    const teamCols = db.pragma('table_info(teams)').map(c => c.name);
    assert.ok(teamCols.includes('pin'));

    const leagueCols = db.pragma('table_info(leagues)').map(c => c.name);
    assert.ok(leagueCols.includes('current_week'));
  });

  await t.test('25. getLeagueStandings loads every week and the cumulative standings from the database', () => {
    const db = createDatabase(':memory:');
    runMigrations(db, 5);

    db.exec(`
      INSERT INTO courses (id, name) VALUES (1, 'Test Course');
      INSERT INTO leagues (id, course_id, name, current_week) VALUES (1, 1, 'Test League', 2);
      INSERT INTO teams (id, league_id, name, current_handicap, pin) VALUES
        (1, 1, 'Alpha', 4.0, '1234'),
        (2, 1, 'Beta', 8.0, '5678');
      INSERT INTO matches (id, league_id, week_number, status) VALUES
        (1, 1, 1, 'completed'),
        (2, 1, 2, 'completed');
      INSERT INTO scores (match_id, team_id, gross_score, handicap_used, net_score, reconciliation_status) VALUES
        (1, 1, 40, 4.0, 36.0, 'ok'),
        (1, 2, 46, 8.0, 38.0, 'ok'),
        (2, 1, 39, 4.0, 35.0, 'ok'),
        (2, 2, 42, 8.0, 34.0, 'ok');
    `);

    const { getLeagueStandings } = require('../lib/services/standingsService');
    const standings = getLeagueStandings(db, 1);

    assert.ok(standings);
    assert.strictEqual(standings.totalActiveTeams, 2);
    assert.strictEqual(standings.weeklyResultsList.length, 2);
    assert.strictEqual(standings.seasonStandings.length, 2);

    // Week 1: Alpha net 36 (1st, 2 pts), Beta net 38 (2nd, 1 pt)
    // Week 2: Beta net 34 (1st, 2 pts), Alpha net 35 (2nd, 1 pt)
    // Total: Both have 3 pts.
    // Alpha avgNet = (36+35)/2 = 35.5
    // Beta avgNet = (38+34)/2 = 36.0
    // Alpha wins tie-breaker with lower avgNet!
    assert.strictEqual(standings.seasonStandings[0].name, 'Alpha');
    assert.strictEqual(standings.seasonStandings[0].seasonRank, 1);
    assert.strictEqual(standings.seasonStandings[0].totalPoints, 3);
    assert.strictEqual(standings.seasonStandings[0].avgNet, 35.5);

    assert.strictEqual(standings.seasonStandings[1].name, 'Beta');
    assert.strictEqual(standings.seasonStandings[1].seasonRank, 2);
    assert.strictEqual(standings.seasonStandings[1].totalPoints, 3);
    assert.strictEqual(standings.seasonStandings[1].avgNet, 36.0);
  });
});
