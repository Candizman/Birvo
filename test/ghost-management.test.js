const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../lib/database/createDatabase');
const { runMigrations } = require('../lib/database/migrations');
const { applyGhostPenalty, getMissingScorecards } = require('../lib/services/ghostManagementService');

function setupLeague() {
  const db = createDatabase(':memory:');
  runMigrations(db);
  const courseId = Number(db.prepare("INSERT INTO courses(name) VALUES ('Birvo Hills')").run().lastInsertRowid);
  const leagueId = Number(db.prepare(`
    INSERT INTO leagues(course_id,name,status,current_week,season_length_weeks)
    VALUES (?, 'Thursday League', 'active', 1, 12)
  `).run(courseId).lastInsertRowid);
  const firstTeamId = Number(db.prepare(`
    INSERT INTO teams(league_id,name,current_handicap,status) VALUES (?, 'Fairway Eagles', 5, 'active')
  `).run(leagueId).lastInsertRowid);
  const missingTeamId = Number(db.prepare(`
    INSERT INTO teams(league_id,name,current_handicap,status) VALUES (?, 'Birdie Club', 8, 'active')
  `).run(leagueId).lastInsertRowid);
  const matchId = Number(db.prepare(`
    INSERT INTO matches(league_id,week_number,status) VALUES (?, 1, 'open')
  `).run(leagueId).lastInsertRowid);
  db.prepare(`
    INSERT INTO scores(match_id,team_id,gross_score,handicap_used,net_score,reconciliation_status,is_ghost)
    VALUES (?, ?, 45, 5, 40, 'ok', 0)
  `).run(matchId, firstTeamId);
  return { db, courseId, leagueId, firstTeamId, missingTeamId, matchId };
}

test('ghost-score management preserves real scorecards and tenant audit scope', () => {
  const { db, courseId, leagueId, firstTeamId, missingTeamId, matchId } = setupLeague();
  const before = getMissingScorecards(db, { courseId, leagueId, weekNumber: 1 });
  assert.deepEqual(before.missingTeams.map(team => team.id), [missingTeamId]);

  const result = applyGhostPenalty(db, {
    courseId, leagueId, weekNumber: 1, teamId: missingTeamId, actorUserId: 'owner-1',
  });
  assert.deepEqual({ ghostGross: result.ghostGross, netScore: result.netScore }, { ghostGross: 45, netScore: 37 });
  const score = db.prepare('SELECT * FROM scores WHERE match_id=? AND team_id=?').get(matchId, missingTeamId);
  assert.equal(score.is_ghost, 1);
  assert.equal(score.reconciliation_status, 'ok');
  assert.equal(score.attestation_status, 'approved');
  const audit = db.prepare("SELECT * FROM audit_events WHERE action='score.ghost.applied'").get();
  assert.equal(audit.course_id, courseId);
  assert.equal(JSON.parse(audit.metadata_json).teamId, missingTeamId);
  assert.equal(getMissingScorecards(db, { courseId, leagueId, weekNumber: 1 }).missingTeams.length, 0);

  assert.throws(() => applyGhostPenalty(db, {
    courseId, leagueId, weekNumber: 1, teamId: firstTeamId, actorUserId: 'owner-1',
  }), /submitted scorecard cannot be replaced/i);
  db.close();
});

test('ghost-score management rejects a neighboring course scope and non-current weeks', () => {
  const { db, courseId, leagueId, missingTeamId } = setupLeague();
  const otherCourseId = Number(db.prepare("INSERT INTO courses(name) VALUES ('Neighbor Course')").run().lastInsertRowid);
  assert.throws(() => applyGhostPenalty(db, {
    courseId: otherCourseId, leagueId, weekNumber: 1, teamId: missingTeamId, actorUserId: 'owner-2',
  }), /active league not found/i);
  assert.throws(() => applyGhostPenalty(db, {
    courseId, leagueId, weekNumber: 2, teamId: missingTeamId, actorUserId: 'owner-1',
  }), /current week/i);
  db.close();
});
