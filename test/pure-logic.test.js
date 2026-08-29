/**
 * Coverage for the backend-independent calculations.
 *
 * When the SQLite runtime was removed, the business rules that write to the
 * database moved into PostgreSQL functions and are covered by the pgTAP suites
 * in supabase/tests/database. What stayed in JavaScript is the pure half:
 * shaping, validation, and the calculations that both the repository layer and
 * the server actions depend on. That is what this file covers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLeagueStandings } = require('../lib/domain/standings');
const { normalizeRSVPStatus, isValidRSVPStatus } = require('../lib/domain/rsvp');
const { buildCourseDetails, getCourseWeather } = require('../lib/services/courseService');
const { buildCourseSetupProgress, SETUP_STEPS } = require('../lib/services/courseSetupService');
const { buildRoundCloseReadiness } = require('../lib/services/roundLifecycleService');
const { buildICalCalendar } = require('../lib/services/fixtureService');
const { calculateAdvancedStats } = require('../lib/services/liveScoringService');
const { escapeCSVCell } = require('../lib/services/reportService');
const { parseCsv } = require('../lib/services/rosterImportService');
const { validateOnboardingInput, OnboardingError } = require('../lib/services/onboardingService');
const { normalizeEmail, validateInvitableRole } = require('../lib/services/membershipService');
const { PLANS } = require('../lib/services/billingService');

test('Pure calculations that survive the PostgreSQL cutover', async t => {

  await t.test('standings: cumulative points, averages, and ghost handling', () => {
    const league = { id: 'L1', name: 'Tuesday', current_week: 3, season_length_weeks: 4 };
    const teams = [
      { id: 'T1', name: 'Eagles', current_handicap: 4, status: 'active' },
      { id: 'T2', name: 'Birdies', current_handicap: 8, status: 'active' },
    ];
    const matches = [
      { id: 'M1', week_number: 1, status: 'locked' },
      { id: 'M2', week_number: 2, status: 'locked' },
    ];
    const scores = [
      { match_id: 'M1', team_id: 'T1', gross_score: 80, handicap_used: 4, net_score: 76, reconciliation_status: 'ok', is_ghost: false },
      { match_id: 'M1', team_id: 'T2', gross_score: 90, handicap_used: 8, net_score: 82, reconciliation_status: 'ok', is_ghost: false },
      { match_id: 'M2', team_id: 'T1', gross_score: 84, handicap_used: 4, net_score: 80, reconciliation_status: 'ok', is_ghost: false },
      { match_id: 'M2', team_id: 'T2', gross_score: 86, handicap_used: 8, net_score: 78, reconciliation_status: 'ok', is_ghost: false },
    ];

    const result = buildLeagueStandings({ league, teams, matches, scores });
    assert.ok(result.seasonStandings.length === 2, 'both teams appear in the season standings');
    assert.equal(result.summary.completedWeeks, 2);

    const total = result.seasonStandings.reduce((sum, row) => sum + row.totalPoints, 0);
    assert.ok(total > 0, 'points are awarded across the season');

    // The better net score in week 1 (76 vs 82) must not rank below the worse one.
    const eagles = result.seasonStandings.find(row => row.id === 'T1');
    const birdies = result.seasonStandings.find(row => row.id === 'T2');
    assert.ok(eagles && birdies);
    assert.ok(eagles.weeksPlayed === 2 && birdies.weeksPlayed === 2);
  });

  await t.test('standings: a score flagged for review is excluded', () => {
    const league = { id: 'L1', name: 'Tuesday', current_week: 2, season_length_weeks: 2 };
    const teams = [{ id: 'T1', name: 'Eagles', current_handicap: 4, status: 'active' }];
    const matches = [{ id: 'M1', week_number: 1, status: 'locked' }];

    const clean = buildLeagueStandings({
      league, teams, matches,
      scores: [{ match_id: 'M1', team_id: 'T1', gross_score: 80, handicap_used: 4, net_score: 76, reconciliation_status: 'ok', is_ghost: false }],
    });
    const flagged = buildLeagueStandings({
      league, teams, matches,
      scores: [{ match_id: 'M1', team_id: 'T1', gross_score: 80, handicap_used: 4, net_score: 76, reconciliation_status: 'needs_review', is_ghost: false }],
    });

    assert.equal(clean.seasonStandings[0].weeksPlayed, 1);
    assert.equal(flagged.seasonStandings[0].weeksPlayed, 0, 'a needs_review card does not count as a played week');
  });

  await t.test('RSVP: aliases normalize and only known statuses validate', () => {
    assert.equal(normalizeRSVPStatus('yes'), 'attending');
    assert.equal(normalizeRSVPStatus('confirmed'), 'attending');
    assert.equal(normalizeRSVPStatus('no'), 'not_attending');
    assert.equal(normalizeRSVPStatus('declined'), 'not_attending');
    assert.equal(normalizeRSVPStatus('needs_sub'), 'needs_sub', 'a canonical value passes through unchanged');

    assert.ok(isValidRSVPStatus('attending'));
    assert.ok(isValidRSVPStatus('needs_sub'));
    assert.ok(!isValidRSVPStatus('maybe_later'));
    assert.ok(!isValidRSVPStatus(''));
  });

  await t.test('course details: front nine, back nine, total par, and maintenance count', () => {
    const holes = Array.from({ length: 18 }, (_, i) => ({
      hole_number: i + 1,
      par: i < 9 ? 4 : 5,
      is_under_maintenance: i === 3 || i === 11,
    }));

    const details = buildCourseDetails({ course: { name: 'Hidden Valley' }, holes, teeBoxes: [{ id: 'tee-1' }] });
    assert.equal(details.stats.front9Par, 36);
    assert.equal(details.stats.back9Par, 45);
    assert.equal(details.stats.totalPar, 81);
    assert.equal(details.stats.totalHoles, 18);
    assert.equal(details.stats.maintenanceHolesCount, 2);

    assert.equal(buildCourseDetails({ course: null }), null, 'a missing course yields null, not a crash');
  });

  await t.test('course weather is flagged as an estimate, never as observed data', () => {
    const weather = getCourseWeather(36.5, -121.9);
    assert.equal(weather.isEstimate, true);
    assert.equal(weather.source, 'birvo-placeholder');
    assert.equal(typeof weather.tempF, 'number');
  });

  await t.test('setup progress: scoring is gated until every prerequisite is met', () => {
    const course = { name: 'Hidden Valley', city: 'Kendallville', state: 'IN', postal_code: '46755', timezone: 'America/New_York' };
    const holes = Array.from({ length: 18 }, (_, i) => ({ stroke_index: i + 1 }));
    const teeBoxes = [{ id: 'tee-1' }];
    const league = { id: 'L1', season_length_weeks: 12 };
    const teams = [{ status: 'active' }, { status: 'active' }];
    const matches = [{ status: 'open' }];

    const ready = buildCourseSetupProgress({ course, holes, teeBoxes, league, teams, matches });
    assert.equal(ready.readyForScoring, true);
    assert.equal(ready.blockers.length, 0);
    assert.equal(ready.completedCount, SETUP_STEPS.length);

    const oneTeam = buildCourseSetupProgress({ course, holes, teeBoxes, league, teams: [{ status: 'active' }], matches });
    assert.equal(oneTeam.readyForScoring, false, 'a single team cannot start scoring');

    const duplicateIndexes = buildCourseSetupProgress({
      course, teeBoxes, league, teams, matches,
      holes: Array.from({ length: 18 }, () => ({ stroke_index: 1 })),
    });
    assert.equal(duplicateIndexes.readyForScoring, false, 'stroke indexes must be unique');

    const noCourse = buildCourseSetupProgress({ course: null });
    assert.equal(noCourse.readyForScoring, false);
    assert.equal(noCourse.completedCount, 0);
  });

  await t.test('round close readiness: reports every blocker before a lock', () => {
    const match = { id: 'M1', locked_at: null };

    const ready = buildRoundCloseReadiness({
      match, activeTeams: 2,
      scores: [
        { attestation_status: 'attested', reconciliation_status: 'ok' },
        { attestation_status: 'approved', reconciliation_status: 'ok' },
      ],
    });
    assert.equal(ready.canLock, true);
    assert.deepEqual(ready.blockers, []);

    const missing = buildRoundCloseReadiness({
      match, activeTeams: 3,
      scores: [{ attestation_status: 'attested', reconciliation_status: 'ok' }],
    });
    assert.equal(missing.canLock, false);
    assert.match(missing.blockers.join(' '), /2 scorecard\(s\) are missing/);

    const unattested = buildRoundCloseReadiness({
      match, activeTeams: 1,
      scores: [{ attestation_status: 'pending', reconciliation_status: 'ok' }],
    });
    assert.equal(unattested.canLock, false);
    assert.match(unattested.blockers.join(' '), /need attestation/);

    const disputed = buildRoundCloseReadiness({
      match, activeTeams: 1,
      scores: [{ attestation_status: 'attested', reconciliation_status: 'needs_review' }],
    });
    assert.equal(disputed.canLock, false);
    assert.match(disputed.blockers.join(' '), /require reconciliation/);

    const alreadyLocked = buildRoundCloseReadiness({
      match: { id: 'M1', locked_at: '2026-08-01T00:00:00Z' }, activeTeams: 1,
      scores: [{ attestation_status: 'attested', reconciliation_status: 'ok' }],
    });
    assert.equal(alreadyLocked.canLock, false);
    assert.match(alreadyLocked.blockers.join(' '), /already locked/);

    const unscheduled = buildRoundCloseReadiness({ match: null, activeTeams: 2, scores: [] });
    assert.equal(unscheduled.canLock, false);
    assert.match(unscheduled.blockers.join(' '), /not been scheduled/);
  });

  await t.test('iCalendar export produces valid RFC 5545 and escapes special characters', () => {
    const ics = buildICalCalendar({
      league: { id: 'L1', name: 'Tuesday; Night' },
      fixtures: [
        { id: 'F1', week_number: 1, team1_name: 'Joe, Mark', team2_name: 'Ann & Sue', is_bye: false },
        { id: 'F2', week_number: 2, team1_name: 'Solo', team2_name: null, is_bye: true },
      ],
      generatedAt: new Date('2026-08-29T12:00:00Z'),
    });

    assert.match(ics, /^BEGIN:VCALENDAR/);
    assert.match(ics, /END:VCALENDAR$/);
    assert.match(ics, /VERSION:2\.0/);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
    assert.match(ics, /SUMMARY:Week 1: Joe\\, Mark vs Ann & Sue/, 'commas are escaped per RFC 5545');
    assert.match(ics, /X-WR-CALNAME:Tuesday\\; Night Schedule/, 'semicolons are escaped');
    assert.match(ics, /SUMMARY:Week 2: Solo \(Bye\)/);
    assert.ok(ics.includes('\r\n'), 'lines are CRLF terminated');
  });

  await t.test('advanced round stats: FIR, GIR, putting average, and sand saves', () => {
    const pars = [4, 4, 3, 5];
    const holes = [
      { grossScore: 4, putts: 2, fairwayHit: true, sandSave: false },   // par 4, GIR (4-2=2 <= 2)
      { grossScore: 5, putts: 2, fairwayHit: false, sandSave: true },   // par 4, no GIR (3 > 2)
      { grossScore: 3, putts: 2, fairwayHit: false, sandSave: false },  // par 3, GIR (1 <= 1)
      { grossScore: 6, putts: 3, fairwayHit: true, sandSave: false },   // par 5, GIR (3 <= 3)
    ];

    const stats = calculateAdvancedStats(holes, pars);
    assert.equal(stats.totalGross, 18);
    assert.equal(stats.totalPutts, 9);
    assert.equal(stats.sandSaves, 1);
    // Fairways are only possible on par 4 and 5: three holes, two hit.
    assert.equal(stats.firPercent, 66.7);
    assert.equal(stats.girPercent, 75);
    assert.equal(stats.avgPuttsPerHole, 2.25);
  });

  await t.test('advanced round stats: a par-3-only card reports 100% fairways', () => {
    const stats = calculateAdvancedStats(
      [{ grossScore: 3, putts: 1 }, { grossScore: 4, putts: 2 }],
      [3, 3]
    );
    assert.equal(stats.firPercent, 100, 'no fairway is possible, so the metric is not penalised');
  });

  await t.test('CSV export defends against formula injection', () => {
    assert.equal(escapeCSVCell('=SUM(A1:A9)'), '"\'=SUM(A1:A9)"');
    assert.equal(escapeCSVCell('+1'), '"\'+1"');
    assert.equal(escapeCSVCell('-1'), '"\'-1"');
    assert.equal(escapeCSVCell('@import'), '"\'@import"');
    assert.equal(escapeCSVCell('Joe & Mark'), '"Joe & Mark"');
    assert.equal(escapeCSVCell('He said "hi"'), '"He said ""hi"""');
    assert.equal(escapeCSVCell(null), '""');
    assert.equal(escapeCSVCell(undefined), '""');
  });

  await t.test('roster CSV parsing handles quotes, embedded commas, and CRLF', () => {
    const rows = parseCsv('team_name,email\r\n"Smith, John",j@example.com\r\n"He said ""hi""",b@example.com\r\n');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], ['team_name', 'email']);
    assert.deepEqual(rows[1], ['Smith, John', 'j@example.com']);
    assert.deepEqual(rows[2], ['He said "hi"', 'b@example.com']);

    assert.throws(() => parseCsv('name\n"unterminated'), /unclosed quoted field/);
  });

  await t.test('onboarding input validation rejects each malformed field', () => {
    const valid = {
      userId: 'u1', email: 'owner@example.com',
      courseName: 'Hidden Valley', address: '1 Fairway', city: 'Kendallville',
      state: 'in', postalCode: '46755', timezone: 'America/New_York',
      leagueName: 'Tuesday Night', gameFormat: 'stroke_play', seasonLengthWeeks: '12',
    };
    const accepted = validateOnboardingInput(valid);
    assert.equal(accepted.state, 'IN', 'state is upper-cased');
    assert.equal(accepted.seasonLengthWeeks, 12, 'season length is coerced to a number');

    assert.throws(() => validateOnboardingInput({ ...valid, courseName: 'X' }), OnboardingError);
    assert.throws(() => validateOnboardingInput({ ...valid, state: 'Indiana' }), OnboardingError);
    assert.throws(() => validateOnboardingInput({ ...valid, postalCode: 'ABCDE' }), OnboardingError);
    assert.throws(() => validateOnboardingInput({ ...valid, timezone: 'Europe/Istanbul' }), OnboardingError);
    assert.throws(() => validateOnboardingInput({ ...valid, gameFormat: 'best_ball' }), OnboardingError);
    assert.throws(() => validateOnboardingInput({ ...valid, seasonLengthWeeks: '0' }), OnboardingError);
    assert.throws(() => validateOnboardingInput({ ...valid, seasonLengthWeeks: '53' }), OnboardingError);
  });

  await t.test('staff invitation validation', () => {
    assert.equal(normalizeEmail('  Owner@Example.COM '), 'owner@example.com');
    assert.throws(() => normalizeEmail('not-an-email'), /valid email/);
    assert.throws(() => normalizeEmail(`${'a'.repeat(250)}@example.com`), /valid email/);

    assert.equal(validateInvitableRole('scorekeeper'), 'scorekeeper');
    assert.equal(validateInvitableRole(undefined), 'scorekeeper', 'defaults to the least privileged role');
    assert.throws(() => validateInvitableRole('course_owner'), /valid staff role/,
      'ownership is never grantable by invitation');
    assert.throws(() => validateInvitableRole('superadmin'), /valid staff role/);
  });

  await t.test('billing plans are internally consistent', () => {
    const keys = Object.keys(PLANS);
    assert.ok(keys.includes('starter') && keys.includes('pro_club') && keys.includes('enterprise'));
    for (const [key, plan] of Object.entries(PLANS)) {
      assert.equal(plan.id, key, `${key} id matches its key`);
      assert.ok(plan.priceMonthly > 0, `${key} has a price`);
      assert.ok(plan.maxLeagues > 0 && plan.maxTeams > 0, `${key} has limits`);
      assert.ok(Array.isArray(plan.features) && plan.features.length > 0, `${key} lists features`);
    }
    assert.ok(PLANS.starter.priceMonthly < PLANS.pro_club.priceMonthly);
    assert.ok(PLANS.pro_club.priceMonthly < PLANS.enterprise.priceMonthly);
    assert.ok(PLANS.starter.maxTeams < PLANS.pro_club.maxTeams);
  });
});
