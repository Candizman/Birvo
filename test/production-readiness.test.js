const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../lib/database/createDatabase');
const { runMigrations } = require('../lib/database/migrations');
const { createTenantWorkspace } = require('../lib/services/onboardingService');
const membership = require('../lib/services/membershipService');
const roster = require('../lib/services/rosterImportService');
const { initializeCourseHolesAndTees } = require('../lib/services/courseService');
const { getCourseSetupProgress } = require('../lib/services/courseSetupService');
const { getRoundCloseReadiness, lockRoundAndAdvance, postponeLeagueWeek } = require('../lib/services/roundLifecycleService');
const { generateAndSaveFixtures, addLeagueSubstitute, saveLeagueTeamRSVP } = require('../lib/services/fixtureService');
const { saveScoresBatch } = require('../lib/services/scoreService');
const { createPublicAccessToken, getPublicLinkVersion, hasPublicLeagueAccess } = require('../lib/publicAccess');
const { rotatePublicLink } = require('../lib/services/publicLinkService');
const { requestScoreCorrection, reviewScoreCorrection } = require('../lib/services/scoreCorrectionService');
const { isHashedTeamPin } = require('../lib/security/pin');

function workspace(db) {
  return createTenantWorkspace(db, {
    userId: 'owner-1', email: 'owner@example.com', courseName: 'Birvo Hills', address: '10 Fairway Dr',
    city: 'Austin', state: 'TX', postalCode: '78701', timezone: 'America/Chicago',
    leagueName: 'Thursday League', gameFormat: 'stroke_play', seasonLengthWeeks: 12,
  });
}

test('Production readiness foundations', async t => {
  await t.test('v15 creates tenant, operations, and link-security tables', () => {
    const db = createDatabase(':memory:'); runMigrations(db);
    const tables = new Set(db.pragma('table_list').map(item => item.name));
    for (const name of ['course_memberships','course_invitations','audit_events','course_setup_steps','roster_imports','score_correction_requests','public_link_settings','rate_limit_events']) assert.ok(tables.has(name), name);
    assert.ok(db.pragma('table_info(matches)').some(column => column.name === 'locked_at'));
    assert.ok(db.pragma('table_info(teams)').some(column => column.name === 'contact_email'));
    db.close();
  });

  await t.test('staff invitations grant no access before matching-email acceptance', () => {
    const db = createDatabase(':memory:'); runMigrations(db); const ids = workspace(db);
    const invite = membership.createInvitation(db, { courseId: ids.courseId, email: 'Staff@Example.com ', role: 'scorekeeper', invitedByUserId: 'owner-1' });
    assert.equal(db.prepare('SELECT COUNT(*) count FROM course_memberships WHERE email = ?').get('staff@example.com').count, 0);
    assert.throws(() => membership.createInvitation(db, { courseId: ids.courseId, email: 'staff@example.com', role: 'scorekeeper', invitedByUserId: 'owner-1' }), /pending invitation/);
    assert.deepEqual(membership.acceptPendingInvitations(db, { userId: 'staff-1', email: 'other@example.com' }), []);
    assert.deepEqual(membership.acceptPendingInvitations(db, { userId: 'staff-1', email: 'staff@example.com' }), [ids.courseId]);
    assert.equal(db.prepare('SELECT role FROM course_memberships WHERE user_id = ?').get('staff-1').role, 'scorekeeper');
    assert.equal(db.prepare('SELECT status FROM course_invitations WHERE id = ?').get(invite.id).status, 'accepted');
    assert.ok(db.prepare("SELECT COUNT(*) count FROM audit_events WHERE action = 'staff.invitation.accepted'").get().count >= 1);
    db.close();
  });

  await t.test('the last owner and current actor cannot be removed', () => {
    const db = createDatabase(':memory:'); runMigrations(db); const ids = workspace(db);
    const owner = db.prepare("SELECT id FROM course_memberships WHERE course_id = ? AND role = 'course_owner'").get(ids.courseId);
    assert.throws(() => membership.removeMember(db, { courseId: ids.courseId, membershipId: owner.id, actorUserId: 'owner-1' }), /own active access/);
    assert.throws(() => membership.updateMemberRole(db, { courseId: ids.courseId, membershipId: owner.id, role: 'scorekeeper', actorUserId: 'owner-1' }), /another active course owner/);
    db.close();
  });

  await t.test('CSV preview quarantines invalid and duplicate rows, then commits only valid teams', () => {
    const db = createDatabase(':memory:'); runMigrations(db); const ids = workspace(db);
    const preview = roster.previewRosterImport(db, {
      courseId: ids.courseId, leagueId: ids.leagueId, uploadedByUserId: 'owner-1', sourceName: 'roster.csv',
      csvText: 'team_name,email,handicap\n"Fairway, Partners",team@example.com,12.4\nFairway Partners,bad-email,9\n"Fairway, Partners",other@example.com,5\n',
    });
    assert.equal(preview.validRows, 1); assert.equal(preview.invalidRows, 2);
    const result = roster.commitRosterImport(db, { importId: preview.importId, courseId: ids.courseId, actorUserId: 'owner-1' });
    assert.equal(result.importedRows, 1); assert.equal(result.credentials.length, 1);
    const team = db.prepare('SELECT * FROM teams WHERE league_id = ?').get(ids.leagueId);
    assert.equal(team.name, 'Fairway, Partners'); assert.ok(isHashedTeamPin(team.pin)); assert.notEqual(team.pin, result.credentials[0].pin);
    assert.throws(() => roster.commitRosterImport(db, { importId: preview.importId, courseId: ids.courseId, actorUserId: 'owner-1' }), /already committed/);
    db.close();
  });

  await t.test('setup gates scoring and locked rounds reject later score writes', () => {
    const db = createDatabase(':memory:'); runMigrations(db); const ids = workspace(db);
    assert.equal(getCourseSetupProgress(db, ids.courseId, ids.leagueId).readyForScoring, false);
    initializeCourseHolesAndTees(db, ids.courseId);
    const insertTeam = db.prepare("INSERT INTO teams (league_id,name,current_handicap,status) VALUES (?, ?, 0, 'active')");
    const first = insertTeam.run(ids.leagueId, 'Alpha').lastInsertRowid; const second = insertTeam.run(ids.leagueId, 'Beta').lastInsertRowid;
    db.prepare("INSERT INTO matches (league_id,week_number,status) VALUES (?,1,'open')").run(ids.leagueId);
    assert.equal(getCourseSetupProgress(db, ids.courseId, ids.leagueId).readyForScoring, true);
    saveScoresBatch(db, ids.leagueId, 1, [{ teamId: Number(first), grossScore: 72 }, { teamId: Number(second), grossScore: 74 }], { actorUserId: 'owner-1' });
    const matchId = db.prepare('SELECT id FROM matches WHERE league_id = ? AND week_number = 1').get(ids.leagueId).id;
    db.prepare("UPDATE scores SET attestation_status = 'attested' WHERE match_id = ?").run(matchId);
    assert.equal(getRoundCloseReadiness(db, ids.leagueId, 1).canLock, true);
    lockRoundAndAdvance(db, { courseId: ids.courseId, leagueId: ids.leagueId, weekNumber: 1, actorUserId: 'owner-1' });
    assert.equal(db.prepare('SELECT current_week FROM leagues WHERE id = ?').get(ids.leagueId).current_week, 2);
    assert.throws(() => saveScoresBatch(db, ids.leagueId, 1, [{ teamId: Number(first), grossScore: 70 }]), /locked/);
    const scoreId = db.prepare('SELECT id FROM scores WHERE match_id=? AND team_id=?').get(matchId, first).id;
    const correction = requestScoreCorrection(db, { courseId: ids.courseId, scoreId, requestedGrossScore: 70, reason: 'Signed scorecard transcription correction', actorUserId: 'owner-1' });
    reviewScoreCorrection(db, { courseId: ids.courseId, requestId: correction.id, decision: 'approved', reviewNote: 'Card image confirmed', actorUserId: 'owner-1' });
    assert.equal(db.prepare('SELECT gross_score FROM scores WHERE id=?').get(scoreId).gross_score, 70);
    assert.equal(db.prepare('SELECT status FROM score_correction_requests WHERE id=?').get(correction.id).status, 'approved');
    db.close();
  });

  await t.test('rainouts atomically shift the schedule, tee sheet, RSVPs, and active week', () => {
    const db = createDatabase(':memory:'); runMigrations(db); const ids = workspace(db);
    const insertTeam = db.prepare("INSERT INTO teams (league_id,name,current_handicap,status) VALUES (?, ?, 0, 'active')");
    const alphaId = Number(insertTeam.run(ids.leagueId, 'Alpha').lastInsertRowid);
    const betaId = Number(insertTeam.run(ids.leagueId, 'Beta').lastInsertRowid);
    const rainoutMatchId = Number(db.prepare("INSERT INTO matches (league_id,week_number,status) VALUES (?,1,'open')").run(ids.leagueId).lastInsertRowid);
    db.prepare("INSERT INTO matches (league_id,week_number,status) VALUES (?,2,'pending')").run(ids.leagueId);
    db.prepare(`
      INSERT INTO match_fixtures (league_id,week_number,team1_id,team2_id,scheduled_date,scheduled_time)
      VALUES (?,1,?,?, '2026-09-03','09:00')
    `).run(ids.leagueId, alphaId, betaId);
    db.prepare(`
      INSERT INTO tee_times (league_id,week_number,start_time,starting_hole,starting_group,team1_id,team2_id)
      VALUES (?,1,'09:00',1,'A',?,?)
    `).run(ids.leagueId, alphaId, betaId);
    db.prepare("INSERT INTO player_rsvps (team_id,week_number,status,note) VALUES (?,1,'attending','Ready')").run(alphaId);

    const result = postponeLeagueWeek(db, {
      courseId: ids.courseId,
      leagueId: ids.leagueId,
      weekNumber: 1,
      actorUserId: 'owner-1',
    });

    assert.deepEqual(result, { nextWeek: 2, matchId: rainoutMatchId });
    assert.deepEqual(
      db.prepare('SELECT current_week,season_length_weeks FROM leagues WHERE id=?').get(ids.leagueId),
      { current_week: 2, season_length_weeks: 13 },
    );
    assert.deepEqual(
      db.prepare('SELECT week_number,status FROM matches WHERE league_id=? ORDER BY week_number').all(ids.leagueId),
      [{ week_number: 1, status: 'rained_out' }, { week_number: 3, status: 'pending' }],
    );
    assert.deepEqual(
      db.prepare('SELECT week_number,scheduled_date FROM match_fixtures WHERE league_id=?').get(ids.leagueId),
      { week_number: 2, scheduled_date: '2026-09-10' },
    );
    assert.equal(db.prepare('SELECT week_number FROM tee_times WHERE league_id=?').get(ids.leagueId).week_number, 2);
    assert.equal(db.prepare('SELECT week_number FROM player_rsvps WHERE team_id=?').get(alphaId).week_number, 2);
    assert.deepEqual(
      db.prepare("SELECT course_id,target_id FROM audit_events WHERE action='round.rainout'").get(),
      { course_id: ids.courseId, target_id: String(rainoutMatchId) },
    );
    db.close();
  });

  await t.test('local schedule operations enforce the course boundary and write audit events', () => {
    const db = createDatabase(':memory:'); runMigrations(db); const ids = workspace(db);
    const insertTeam = db.prepare("INSERT INTO teams (league_id,name,current_handicap,status) VALUES (?, ?, 0, 'active')");
    const alphaId = Number(insertTeam.run(ids.leagueId, 'Alpha').lastInsertRowid);
    insertTeam.run(ids.leagueId, 'Beta');

    const generated = generateAndSaveFixtures(db, ids.leagueId, 2, false, {
      courseId: ids.courseId,
      actorUserId: 'owner-1',
    });
    const substitute = addLeagueSubstitute(db, {
      courseId: ids.courseId,
      leagueId: ids.leagueId,
      actorUserId: 'owner-1',
      data: { name: 'Casey Morgan', handicap: 9.2, phone: '', email: 'casey@example.com' },
    });
    const rsvp = saveLeagueTeamRSVP(db, {
      courseId: ids.courseId,
      leagueId: ids.leagueId,
      teamId: alphaId,
      weekNumber: 1,
      status: 'needs_sub',
      note: 'Travel delay',
      actorUserId: 'owner-1',
    });

    assert.equal(generated.fixtureCount, 2);
    assert.ok(substitute.id > 0);
    assert.ok(rsvp.id > 0);
    assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_events WHERE action IN ('league.fixtures.replaced','league.substitute.added','league.rsvp.saved')").get().count, 3);
    assert.throws(() => addLeagueSubstitute(db, {
      courseId: ids.courseId + 999,
      leagueId: ids.leagueId,
      actorUserId: 'owner-1',
      data: { name: 'Cross Tenant', handicap: 1, phone: '', email: '' },
    }), /Active league not found/);
    db.close();
  });

  await t.test('rotating a public link immediately rejects its previous version', () => {
    const db = createDatabase(':memory:'); runMigrations(db); const ids = workspace(db);
    const token = createPublicAccessToken({ leagueId: ids.leagueId, purpose: 'player', version: 1 });
    assert.equal(hasPublicLeagueAccess(token, { leagueId: ids.leagueId, purpose: 'player' }, Date.now(), db), true);
    rotatePublicLink(db, { courseId: ids.courseId, leagueId: ids.leagueId, purpose: 'player', actorUserId: 'owner-1' });
    assert.equal(hasPublicLeagueAccess(token, { leagueId: ids.leagueId, purpose: 'player' }, Date.now(), db), false);
    const version = getPublicLinkVersion(db, ids.leagueId, 'player');
    const replacement = createPublicAccessToken({ leagueId: ids.leagueId, purpose: 'player', version });
    assert.equal(hasPublicLeagueAccess(replacement, { leagueId: ids.leagueId, purpose: 'player' }, Date.now(), db), true);
    db.close();
  });

  await t.test('Postgres migration has complete RLS and cross-tenant guards', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/202608240001_birvo_tenant_foundation.sql'), 'utf8');
    for (const table of ['courses','course_memberships','course_invitations','leagues','teams','matches','scores','audit_events','roster_imports']) {
      assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security|array\\[[^\\]]*'${table}'`, 'i'), table);
    }
    assert.match(sql, /ensure_tenant_consistency/); assert.match(sql, /prevent_locked_score_change/);
    assert.match(sql, /accept_course_invitation/); assert.match(sql, /revoke all on public/);
    assert.doesNotMatch(sql, /subscription_status\s+text\s+default\s+'active'/i);
  });

  await t.test('QR generation stays on the Birvo server', () => {
    const route = fs.readFileSync(path.join(process.cwd(), 'app/api/qr/route.js'), 'utf8');
    assert.match(route, /QRCode\.toBuffer/);
    assert.match(route, /private, no-store/);
    assert.doesNotMatch(route, /api\.qrserver\.com|quickchart\.io/i);
  });
});
