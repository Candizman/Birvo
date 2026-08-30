const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workspaceRepository = require('../lib/data/supabase/workspaceRepository');
const operationsRepository = require('../lib/data/supabase/operationsRepository');
const publicAccessRepository = require('../lib/data/supabase/publicAccessRepository');
const playerRepository = require('../lib/data/supabase/playerRepository');
const dashboardRepository = require('../lib/data/supabase/dashboardRepository');
const courseRepository = require('../lib/data/supabase/courseRepository');
const leagueRepository = require('../lib/data/supabase/leagueRepository');
const publishingRepository = require('../lib/data/supabase/publishingRepository');
const { createPublicAccessToken } = require('../lib/publicAccess');
const { SupabaseDataError } = require('../lib/data/supabase/errors');
const persistentRateLimit = require('../lib/data/persistentRateLimit');
const { getSupabaseHealthSnapshot } = require('../lib/data/supabase/healthRepository');

const UUIDS = Object.freeze({
  user: '10000000-0000-4000-8000-000000000001',
  course: 'a0000000-0000-4000-8000-000000000001',
  league: 'a1000000-0000-4000-8000-000000000001',
  team: 'a2000000-0000-4000-8000-000000000001',
  opponent: 'a2000000-0000-4000-8000-000000000002',
  score: 'a3000000-0000-4000-8000-000000000001',
});

function migration(name) {
  return fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', name), 'utf8');
}

function queryResult(data, calls, error = null) {
  const query = {
    select(value) { calls.push(['select', value]); return query; },
    eq(column, value) { calls.push(['eq', column, value]); return query; },
    gt(column, value) { calls.push(['gt', column, value]); return query; },
    order(column, options) { calls.push(['order', column, options]); return query; },
    then(resolve, reject) { return Promise.resolve({ data, error }).then(resolve, reject); },
  };
  return query;
}

function fixtureClient(fixtures, calls) {
  return {
    from(table) {
      calls.push(['from', table]);
      const filters = [];
      let sort = null;
      const query = {
        select(value) { calls.push(['select', table, value]); return query; },
        eq(column, value) { calls.push(['eq', table, column, value]); filters.push(row => row[column] === value); return query; },
        neq(column, value) { calls.push(['neq', table, column, value]); filters.push(row => row[column] !== value); return query; },
        in(column, values) { calls.push(['in', table, column, values]); filters.push(row => values.includes(row[column])); return query; },
        order(column, options) { calls.push(['order', table, column, options]); sort = { column, ascending: options?.ascending !== false }; return query; },
        async maybeSingle() {
          const rows = resolveRows();
          return { data: rows[0] || null, error: null };
        },
        then(resolve, reject) { return Promise.resolve({ data: resolveRows(), error: null }).then(resolve, reject); },
      };
      function resolveRows() {
        let rows = [...(fixtures[table] || [])].filter(row => filters.every(filter => filter(row)));
        if (sort) rows.sort((left, right) => {
          const result = String(left[sort.column] ?? '').localeCompare(String(right[sort.column] ?? ''), undefined, { numeric: true });
          return sort.ascending ? result : -result;
        });
        return rows;
      }
      return query;
    },
  };
}

test('PostgreSQL production contract', async t => {
  await t.test('feature parity migration covers every previously missing domain table and enables RLS', () => {
    const sql = migration('202608250001_birvo_feature_parity.sql');
    const tables = [
      'match_fixtures','tee_times','substitutes','player_rsvps','handicap_audit_logs',
      'score_audit_logs','player_profiles','player_badges','player_bag_clubs','round_notes',
      'tv_displays','tv_sponsors','billing_invoices','coupon_codes','tournament_entry_fees','app_metadata',
    ];
    for (const table of tables) {
      assert.match(sql, new RegExp(`create table public\\.${table}\\s*\\(`, 'i'), `${table} table`);
      assert.match(sql, new RegExp(`'${table}'`, 'i'), `${table} appears in the RLS contract`);
    }
    assert.match(sql, /create schema if not exists private/i);
    assert.match(sql, /create table private\.rate_limit_events/i);
    assert.match(sql, /avg_distance_yards integer/i);
    assert.doesNotMatch(sql, /avg_distance_meters integer/i);
    assert.match(sql, /revoke all on schema private from public,anon,authenticated/i);
    assert.doesNotMatch(sql, /grant[^;]*app_metadata[^;]*authenticated/i);
  });

  await t.test('every exposed atomic RPC is hardened and privileges are explicit', () => {
    const sql = `${migration('202608250002_birvo_atomic_operations.sql')}\n${migration('202608260001_birvo_publishing_and_ghost.sql')}`;
    const authenticatedRpcs = [
      'create_tenant_workspace','accept_pending_course_invitations','create_course_invitation','update_course_member_role',
      'remove_course_member','revoke_course_invitation','save_score_batch',
      'lock_round_and_advance','request_score_correction','review_score_correction','rotate_public_link',
      'initialize_course_layout','update_course_profile','save_course_holes','upsert_course_tee_box',
      'delete_course_tee_box','generate_shotgun_tee_times',
      'create_league','update_league_format','save_league_playoff_bracket','replace_league_fixtures',
      'add_league_substitute','save_team_rsvp','postpone_league_week',
      'save_tv_display_settings','add_tv_sponsor','delete_tv_sponsor','apply_ghost_score',
    ];
    for (const name of authenticatedRpcs) {
      const functionStart = sql.indexOf(`create or replace function public.${name}(`);
      assert.notEqual(functionStart, -1, `${name} exists`);
      const bodyEnd = sql.indexOf('end $$;', functionStart);
      const functionSql = sql.slice(functionStart, bodyEnd);
      assert.match(functionSql, /security definer/i, `${name} uses SECURITY DEFINER`);
      assert.match(functionSql, /set search_path=''/i, `${name} fixes search_path`);
      assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(`, 'i'), `${name} has an explicit grant`);
    }
    const serviceRpcs = [
      'consume_rate_limit','mark_course_invitation_delivery','register_player_team',
      'upgrade_player_pin_hash','submit_player_gross_score','submit_player_hole_scorecard',
      'attest_player_score','update_player_profile','add_player_bag_club',
      'delete_player_bag_club','save_player_round_note',
    ];
    for (const name of serviceRpcs) {
      const functionStart = sql.indexOf(`create or replace function public.${name}(`);
      assert.notEqual(functionStart, -1, `${name} exists`);
      const bodyEnd = sql.indexOf('end $$;', functionStart);
      const functionSql = sql.slice(functionStart, bodyEnd);
      assert.match(functionSql, /security definer/i, `${name} uses SECURITY DEFINER`);
      assert.match(functionSql, /set search_path=''/i, `${name} fixes search_path`);
      assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role`, 'i'));
      assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+to authenticated`, 'i'));
    }
    assert.match(sql, /revoke execute on all functions in schema public from public,anon,authenticated/i);
    assert.match(sql, /grant execute on function public\.consume_rate_limit\([^;]+to service_role/i);
    assert.doesNotMatch(sql, /grant execute on function public\.consume_rate_limit\([^;]+to authenticated/i);
    assert.match(sql, /current_user=\([\s\S]*review_score_correction\(uuid,uuid,text,text\)/i);
  });

  await t.test('publishing migration records explicit ghost provenance and advances readiness', () => {
    const sql = migration('202608260001_birvo_publishing_and_ghost.sql');
    assert.match(sql, /add column if not exists is_ghost boolean not null default false/i);
    assert.match(sql, /where public\.scores\.is_ghost=true/i);
    assert.match(sql, /A submitted scorecard cannot be replaced with a ghost score/i);
    assert.match(sql, /schema_version=4/i);
  });

  await t.test('workspace reads are tenant scoped and preserve UUID identifiers', async () => {
    const calls = [];
    const client = {
      from(table) {
        calls.push(['from', table]);
        if (table === 'course_memberships') {
          return queryResult([{ course_id: UUIDS.course, role: 'course_owner', courses: { name: 'Birvo Hills' } }], calls);
        }
        return queryResult([{ id: UUIDS.league, name: 'Thursday League', current_week: 2 }], calls);
      },
    };
    const memberships = await workspaceRepository.listUserMemberships(client, UUIDS.user);
    const leagues = await workspaceRepository.listActiveLeagues(client, UUIDS.course);
    assert.deepEqual(memberships, [{ course_id: UUIDS.course, role: 'course_owner', course_name: 'Birvo Hills' }]);
    assert.equal(leagues[0].id, UUIDS.league);
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'user_id' && call[2] === UUIDS.user));
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'course_id' && call[2] === UUIDS.course));
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'status' && call[2] === 'active'));
  });

  await t.test('admin dashboard reads are explicitly tenant scoped and exclude neighboring course data', async () => {
    const calls = [];
    const otherCourse = 'b0000000-0000-4000-8000-000000000001';
    const otherLeague = 'b1000000-0000-4000-8000-000000000001';
    const match = 'a4000000-0000-4000-8000-000000000001';
    const fixtures = {
      courses: [
        { id: UUIDS.course, name: 'Birvo Hills', city: 'Austin', state: 'TX', postal_code: '78701', timezone: 'America/Chicago' },
        { id: otherCourse, name: 'Neighbor Course', city: 'Dallas', state: 'TX', postal_code: '75201', timezone: 'America/Chicago' },
      ],
      leagues: [
        { id: UUIDS.league, course_id: UUIDS.course, name: 'Thursday League', current_week: 1, game_format: 'stroke_play', season_length_weeks: 12, status: 'active' },
        { id: otherLeague, course_id: otherCourse, name: 'Private League', current_week: 1, game_format: 'stroke_play', season_length_weeks: 12, status: 'active' },
      ],
      teams: [
        { id: UUIDS.team, course_id: UUIDS.course, league_id: UUIDS.league, name: 'Fairway Eagles', current_handicap: 8, status: 'active' },
        { id: UUIDS.opponent, course_id: UUIDS.course, league_id: UUIDS.league, name: 'Birdie Club', current_handicap: 10, status: 'active' },
        { id: 'b2000000-0000-4000-8000-000000000001', course_id: otherCourse, league_id: otherLeague, name: 'Hidden Team', current_handicap: 2, status: 'active' },
      ],
      matches: [
        { id: match, course_id: UUIDS.course, league_id: UUIDS.league, week_number: 1, status: 'open', locked_at: null },
        { id: 'b4000000-0000-4000-8000-000000000001', course_id: otherCourse, league_id: otherLeague, week_number: 1, status: 'open', locked_at: null },
      ],
      course_holes: Array.from({ length: 9 }, (_, index) => ({ id: `hole-${index + 1}`, course_id: UUIDS.course, hole_number: index + 1, stroke_index: index + 1 })),
      course_tee_boxes: [{ id: 'tee-1', course_id: UUIDS.course }],
      scores: [
        { id: UUIDS.score, course_id: UUIDS.course, match_id: match, team_id: UUIDS.team, gross_score: 76, handicap_used: 8, net_score: 68, attestation_status: 'attested', reconciliation_status: 'ok', created_at: '2026-08-25T12:00:00Z' },
        { id: 'b3000000-0000-4000-8000-000000000001', course_id: otherCourse, match_id: 'b4000000-0000-4000-8000-000000000001', team_id: 'b2000000-0000-4000-8000-000000000001', gross_score: 62, handicap_used: 2, net_score: 60, attestation_status: 'attested', reconciliation_status: 'needs_review', created_at: '2026-08-25T13:00:00Z' },
      ],
    };
    const snapshot = await dashboardRepository.getAdminDashboardSnapshot(
      fixtureClient(fixtures, calls),
      { courseId: UUIDS.course, leagueId: UUIDS.league }
    );
    assert.equal(snapshot.course.name, 'Birvo Hills');
    assert.equal(snapshot.standingsData.totalActiveTeams, 2);
    assert.equal(snapshot.recentScores.length, 1);
    assert.equal(snapshot.recentScores[0].team_name, 'Fairway Eagles');
    assert.equal(snapshot.needsReviewCount, 0);
    for (const table of ['teams', 'matches', 'course_holes', 'course_tee_boxes', 'scores']) {
      assert.ok(calls.some(call => call[0] === 'eq' && call[1] === table
        && call[2] === 'course_id' && call[3] === UUIDS.course), `${table} has a course scope`);
    }
  });

  await t.test('admin public-link versions use one course-and-league scoped query', async () => {
    const calls = [];
    const versions = await publicAccessRepository.getPublicLinkVersions(fixtureClient({
      public_link_settings: [
        { course_id: UUIDS.course, league_id: UUIDS.league, purpose: 'standings', token_version: 4 },
        { course_id: UUIDS.course, league_id: UUIDS.league, purpose: 'tv', token_version: 2 },
      ],
    }, calls), { courseId: UUIDS.course, leagueId: UUIDS.league, purposes: ['standings', 'tv', 'player'] });
    assert.deepEqual(versions, { standings: 4, tv: 2, player: 1 });
    assert.equal(calls.filter(call => call[0] === 'from' && call[1] === 'public_link_settings').length, 1);
    assert.ok(calls.some(call => call[0] === 'eq' && call[2] === 'course_id' && call[3] === UUIDS.course));
    assert.ok(calls.some(call => call[0] === 'eq' && call[2] === 'league_id' && call[3] === UUIDS.league));
    assert.ok(calls.some(call => call[0] === 'in' && call[2] === 'purpose'));
  });

  await t.test('public standings and TV reads derive and enforce the signed league tenant scope', async () => {
    const calls = [];
    const otherCourse = 'b0000000-0000-4000-8000-000000000001';
    const otherLeague = 'b1000000-0000-4000-8000-000000000001';
    const match = 'a4000000-0000-4000-8000-000000000001';
    const fixtures = {
      leagues: [
        { id: UUIDS.league, course_id: UUIDS.course, name: 'Thursday League', status: 'active', current_week: 1 },
        { id: otherLeague, course_id: otherCourse, name: 'Private League', status: 'active', current_week: 1 },
      ],
      courses: [
        { id: UUIDS.course, name: 'Birvo Hills', city: 'Austin', state: 'TX' },
        { id: otherCourse, name: 'Neighbor Course', city: 'Dallas', state: 'TX' },
      ],
      teams: [
        { id: UUIDS.team, course_id: UUIDS.course, league_id: UUIDS.league, name: 'Fairway Eagles', current_handicap: 8, status: 'active', created_at: '2026-01-01' },
        { id: UUIDS.opponent, course_id: UUIDS.course, league_id: UUIDS.league, name: 'Birdie Club', current_handicap: 10, status: 'active', created_at: '2026-01-02' },
        { id: 'b2000000-0000-4000-8000-000000000001', course_id: otherCourse, league_id: otherLeague, name: 'Hidden Team', current_handicap: 2, status: 'active', created_at: '2026-01-01' },
      ],
      matches: [
        { id: match, course_id: UUIDS.course, league_id: UUIDS.league, week_number: 1, status: 'open' },
        { id: 'b4000000-0000-4000-8000-000000000001', course_id: otherCourse, league_id: otherLeague, week_number: 1, status: 'open' },
      ],
      scores: [
        { course_id: UUIDS.course, match_id: match, team_id: UUIDS.team, gross_score: 76, handicap_used: 8, net_score: 68, reconciliation_status: 'ok' },
        { course_id: UUIDS.course, match_id: match, team_id: UUIDS.opponent, gross_score: 80, handicap_used: 10, net_score: 70, reconciliation_status: 'ok' },
        { course_id: otherCourse, match_id: 'b4000000-0000-4000-8000-000000000001', team_id: 'b2000000-0000-4000-8000-000000000001', gross_score: 60, handicap_used: 2, net_score: 58, reconciliation_status: 'ok' },
      ],
      tv_displays: [{ id: 'display-1', course_id: UUIDS.course, league_id: UUIDS.league, name: 'Main TV', auto_scroll_speed: 12, created_at: '2026-01-01' }],
      tv_sponsors: [
        { id: 'sponsor-1', course_id: UUIDS.course, league_id: UUIDS.league, name: 'Local Partner', active: true, display_order: 1 },
        { id: 'sponsor-2', course_id: otherCourse, league_id: otherLeague, name: 'Hidden Partner', active: true, display_order: 1 },
      ],
    };
    const snapshot = await publishingRepository.getPublicTVSnapshot(
      fixtureClient(fixtures, calls), UUIDS.league
    );
    assert.equal(snapshot.league.course_name, 'Birvo Hills');
    assert.deepEqual(snapshot.standings.map(team => team.name), ['Fairway Eagles', 'Birdie Club']);
    assert.deepEqual(snapshot.sponsors.map(sponsor => sponsor.name), ['Local Partner']);
    assert.equal(snapshot.display.name, 'Main TV');
    assert.equal(snapshot.weather, null);
    for (const table of ['teams', 'matches', 'scores', 'tv_displays', 'tv_sponsors']) {
      assert.ok(calls.some(call => call[0] === 'eq' && call[1] === table
        && call[2] === 'course_id' && call[3] === UUIDS.course), `${table} has a derived course scope`);
    }
  });

  await t.test('course management reads stay course scoped and expose only US yardage', async () => {
    const calls = [];
    const fixtures = {
      courses: [{ id: UUIDS.course, name: 'Birvo Hills', city: 'Austin', state: 'TX', postal_code: '78701', timezone: 'America/Chicago' }],
      course_holes: Array.from({ length: 18 }, (_, index) => ({
        id: `hole-${index + 1}`, course_id: UUIDS.course, layout_name: 'Main Course', hole_number: index + 1,
        par: index % 4 === 2 ? 3 : 4, stroke_index: index + 1, pin_position: 'center', is_under_maintenance: false,
      })),
      course_tee_boxes: [{
        id: 'tee-1', course_id: UUIDS.course, layout_name: 'Main Course', name: 'Blue', color_hex: '#2563EB',
        gender: 'all', course_rating: 72.1, slope_rating: 128, total_yards: 6400,
      }],
      course_memberships: [{ id: 'member-1', course_id: UUIDS.course, email: 'owner@example.com', role: 'course_owner', status: 'active' }],
      course_invitations: [],
    };
    const details = await courseRepository.getCourseManagementDetails(fixtureClient(fixtures, calls), UUIDS.course);
    assert.equal(details.teeBoxes[0].total_yards, 6400);
    assert.equal(Object.hasOwn(details.teeBoxes[0], 'total_meters'), false);
    const teeSelect = calls.find(call => call[0] === 'select' && call[1] === 'course_tee_boxes');
    assert.doesNotMatch(teeSelect[2], /meters/i);
    assert.equal(details.stats.totalHoles, 18);
    for (const table of ['course_holes', 'course_tee_boxes', 'course_memberships', 'course_invitations']) {
      assert.ok(calls.some(call => call[0] === 'eq' && call[1] === table
        && call[2] === 'course_id' && call[3] === UUIDS.course), `${table} has a course scope`);
    }
  });

  await t.test('course management writes use the audited atomic RPC surface', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: null, error: null };
      },
    };
    await operationsRepository.updateCourseProfile(client, {
      courseId: UUIDS.course, name: 'Birvo Hills', address: '1 Fairway Way', city: 'Austin',
      contactEmail: 'golf@example.com', contactPhone: '512-555-0100', primaryColor: '#1D7A5F', localRules: 'USGA rules apply.',
    });
    await operationsRepository.saveCourseHoles(client, {
      courseId: UUIDS.course,
      holes: Array.from({ length: 18 }, (_, index) => ({
        hole_number: index + 1, par: 4, stroke_index: index + 1, pin_position: 'center', is_under_maintenance: false,
      })),
    });
    await operationsRepository.generateShotgunTeeTimes(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, weekNumber: 3, startTime: '09:00',
    });
    assert.deepEqual(calls.map(call => call.name), [
      'update_course_profile', 'save_course_holes', 'generate_shotgun_tee_times',
    ]);
    assert.equal(calls[1].parameters.p_holes.length, 18);
    assert.equal(calls[2].parameters.p_course_id, UUIDS.course);
    assert.equal(calls[2].parameters.p_league_id, UUIDS.league);
  });

  await t.test('fixture management reads use real scoped tee times and canonical RSVP statuses', async () => {
    const calls = [];
    const teeTimeId = 'a5000000-0000-4000-8000-000000000001';
    const fixtures = {
      leagues: [{ id: UUIDS.league, course_id: UUIDS.course, name: 'Thursday League', status: 'active', current_week: 1 }],
      teams: [
        { id: UUIDS.team, course_id: UUIDS.course, league_id: UUIDS.league, name: 'Fairway Eagles', status: 'active', created_at: '2026-01-01' },
        { id: UUIDS.opponent, course_id: UUIDS.course, league_id: UUIDS.league, name: 'Birdie Club', status: 'active', created_at: '2026-01-02' },
      ],
      match_fixtures: [{ id: 'a6000000-0000-4000-8000-000000000001', course_id: UUIDS.course, league_id: UUIDS.league, week_number: 1, team1_id: UUIDS.team, team2_id: UUIDS.opponent, is_bye: false }],
      substitutes: [{ id: 'a7000000-0000-4000-8000-000000000001', course_id: UUIDS.course, league_id: UUIDS.league, name: 'Jordan Lee', handicap: '9.4', status: 'available' }],
      tee_times: [{ id: teeTimeId, course_id: UUIDS.course, league_id: UUIDS.league, week_number: 1, starting_hole: 7, starting_group: 'A', start_time: '09:00:00', team1_id: UUIDS.team, team2_id: UUIDS.opponent, status: 'scheduled' }],
      course_holes: [{ course_id: UUIDS.course, layout_name: 'Main Course', hole_number: 7, par: 4, is_under_maintenance: false }],
      player_rsvps: [{ id: 'a8000000-0000-4000-8000-000000000001', course_id: UUIDS.course, team_id: UUIDS.team, week_number: 1, status: 'confirmed', note: '' }],
    };
    const snapshot = await leagueRepository.getFixtureManagementSnapshot(
      fixtureClient(fixtures, calls),
      { courseId: UUIDS.course, leagueId: UUIDS.league, weekNumber: 1 }
    );
    assert.equal(snapshot.fixtures[0].team2_name, 'Birdie Club');
    assert.equal(snapshot.teeTimes[0].starting_hole, 7);
    assert.equal(snapshot.teeTimes[0].team1_name, 'Fairway Eagles');
    assert.equal(snapshot.courseHoles[0].par, 4);
    assert.equal(snapshot.rsvps[0].status, 'attending');
    assert.equal(snapshot.substitutes[0].handicap, 9.4);
    for (const table of ['teams', 'match_fixtures', 'substitutes', 'tee_times', 'course_holes', 'player_rsvps']) {
      assert.ok(calls.some(call => call[0] === 'eq' && call[1] === table
        && call[2] === 'course_id' && call[3] === UUIDS.course), `${table} has a course scope`);
    }
  });

  await t.test('league and schedule mutations call only scoped atomic RPCs', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: null, error: null };
      },
    };
    await operationsRepository.createLeague(client, {
      courseId: UUIDS.course, name: 'Fall League', gameFormat: 'stroke_play', seasonLengthWeeks: 10,
    });
    await operationsRepository.replaceLeagueFixtures(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, totalWeeks: 2, doubleRound: true,
      fixtures: [{ week_number: 1, team1_id: UUIDS.team, team2_id: UUIDS.opponent, is_bye: 0 }],
    });
    await operationsRepository.saveTeamRsvp(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, teamId: UUIDS.team,
      weekNumber: 1, status: 'attending', note: '',
    });
    await operationsRepository.postponeLeagueWeek(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, weekNumber: 1,
    });
    assert.deepEqual(calls.map(call => call.name), [
      'create_league', 'replace_league_fixtures', 'save_team_rsvp', 'postpone_league_week',
    ]);
    assert.equal(calls.every(call => call.parameters.p_course_id === UUIDS.course), true);
    assert.equal(calls[1].parameters.p_league_id, UUIDS.league);
    assert.equal(calls[2].parameters.p_team_id, UUIDS.team);
  });

  await t.test('TV publishing and ghost writes use audited tenant-scoped RPCs', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: null, error: null };
      },
    };
    await operationsRepository.saveTVDisplaySettings(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, templateType: 'leaderboard_ticker',
      autoScrollSpeed: 8, showAnnouncements: true, announcementText: 'Welcome',
      celebrationEffects: true, soundEnabled: false,
    });
    await operationsRepository.addTVSponsor(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, name: 'Fairway Grill', logoUrl: '', displayOrder: 1,
    });
    await operationsRepository.deleteTVSponsor(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, sponsorId: UUIDS.score,
    });
    await operationsRepository.applyGhostScore(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, teamId: UUIDS.team, weekNumber: 2,
    });
    assert.deepEqual(calls.map(call => call.name), [
      'save_tv_display_settings', 'add_tv_sponsor', 'delete_tv_sponsor', 'apply_ghost_score',
    ]);
    assert.equal(calls.every(call => call.parameters.p_course_id === UUIDS.course), true);
    assert.equal(calls.every(call => call.parameters.p_league_id === UUIDS.league), true);
    assert.equal(calls[3].parameters.p_team_id, UUIDS.team);
  });

  await t.test('pending invitation acceptance is one atomic database operation', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: [UUIDS.course], error: null };
      },
    };
    const accepted = await workspaceRepository.acceptPendingInvitations(client);
    assert.deepEqual(accepted, [UUIDS.course]);
    assert.deepEqual(calls, [{ name: 'accept_pending_course_invitations', parameters: {} }]);
  });

  await t.test('critical writes call only the atomic RPC surface', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: { savedCount: 1 }, error: null };
      },
    };
    await operationsRepository.saveScoreBatch(client, {
      courseId: UUIDS.course, leagueId: UUIDS.league, weekNumber: 3,
      scores: [{ teamId: UUIDS.team, grossScore: 73 }],
    });
    assert.deepEqual(calls, [{
      name: 'save_score_batch',
      parameters: {
        p_course_id: UUIDS.course,
        p_league_id: UUIDS.league,
        p_week_number: 3,
        p_scores: [{ teamId: UUIDS.team, grossScore: 73 }],
      },
    }]);
  });

  await t.test('public registration sends only a PIN hash through the service RPC', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: UUIDS.team, error: null };
      },
    };
    const teamId = await operationsRepository.registerPlayerTeam(client, {
      leagueId: UUIDS.league,
      teamName: 'Fairway Eagles',
      handicap: 8.4,
      pinHash: 'scrypt$salt$one-way-hash',
    });
    assert.equal(teamId, UUIDS.team);
    assert.deepEqual(calls, [{
      name: 'register_player_team',
      parameters: {
        p_league_id: UUIDS.league,
        p_team_name: 'Fairway Eagles',
        p_handicap: 8.4,
        p_pin_hash: 'scrypt$salt$one-way-hash',
      },
    }]);
    assert.equal(JSON.stringify(calls).includes('4242'), false);
  });

  await t.test('player gross scoring uses the session team only and one atomic RPC', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: { scoreId: UUIDS.score, weekNumber: 4 }, error: null };
      },
    };
    await operationsRepository.submitPlayerGrossScore(client, { teamId: UUIDS.team, grossScore: 73 });
    assert.deepEqual(calls, [{
      name: 'submit_player_gross_score',
      parameters: { p_team_id: UUIDS.team, p_gross_score: 73 },
    }]);
  });

  await t.test('hole-by-hole scorecard and attestation remain atomic service operations', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: { scoreId: UUIDS.score }, error: null };
      },
    };
    await operationsRepository.submitPlayerHoleScorecard(client, {
      teamId: UUIDS.team,
      matchId: 'a4000000-0000-4000-8000-000000000001',
      holes: [{ holeNumber: 1, grossScore: 4, putts: 2, fairwayHit: true, sandSave: false, penaltyStrokes: 0 }],
    });
    await operationsRepository.attestPlayerScore(client, {
      teamId: UUIDS.team,
      scoreId: UUIDS.score,
      attestingTeamId: UUIDS.opponent,
    });
    assert.deepEqual(calls.map(call => call.name), ['submit_player_hole_scorecard', 'attest_player_score']);
    assert.deepEqual(calls[0].parameters.p_holes[0], {
      holeNumber: 1, grossScore: 4, putts: 2, fairwayHit: true, sandSave: false, penaltyStrokes: 0,
    });
    assert.equal(calls[1].parameters.p_attesting_team_id, UUIDS.opponent);
  });

  await t.test('player profile writes preserve the session team boundary and US yard units', async () => {
    const calls = [];
    const client = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: null, error: null };
      },
    };
    await operationsRepository.updatePlayerProfile(client, {
      teamId: UUIDS.team,
      bio: 'Weekend league player',
      favoriteClub: '7 Iron',
      handicapGoal: 7.5,
      themePreference: 'system',
      language: 'en-US',
    });
    await operationsRepository.addPlayerBagClub(client, {
      teamId: UUIDS.team,
      clubName: 'Driver',
      brand: 'Demo',
      avgDistanceYards: 275,
    });
    assert.deepEqual(calls.map(call => call.name), ['update_player_profile', 'add_player_bag_club']);
    assert.equal(calls[0].parameters.p_team_id, UUIDS.team);
    assert.equal(calls[1].parameters.p_avg_distance_yards, 275);
    assert.equal(Object.hasOwn(calls[1].parameters, 'p_avg_distance_meters'), false);
  });

  await t.test('public player links enforce the stored version and revocation list', async () => {
    const calls = [];
    const token = createPublicAccessToken({ leagueId: UUIDS.league, purpose: 'player', version: 3 }, 1_000_000);
    const client = {
      from(table) {
        calls.push(['from', table]);
        const data = table === 'public_link_settings' ? { token_version: 3 } : null;
        const query = {
          select(value) { calls.push(['select', table, value]); return query; },
          eq(column, value) { calls.push(['eq', table, column, value]); return query; },
          async maybeSingle() { return { data, error: null }; },
        };
        return query;
      },
    };
    assert.equal(await publicAccessRepository.validatePublicLeagueAccess(
      client, token, { leagueId: UUIDS.league, purpose: 'player' }, 1_000_000
    ), true);
    assert.ok(calls.some(call => call[0] === 'from' && call[1] === 'public_link_revocations'));
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'public_link_settings'
      && call[2] === 'league_id' && call[3] === UUIDS.league));
  });

  await t.test('player home reads the fixture model and never selects the team PIN', async () => {
    const calls = [];
    const rows = {
      teams: [
        { id: UUIDS.team, name: 'Fairway Eagles', current_handicap: 8.4, league_id: UUIDS.league, course_id: UUIDS.course },
        { name: 'Birdie Club' },
      ],
      leagues: [{ id: UUIDS.league, name: 'Thursday League', current_week: 4, course_id: UUIDS.course }],
      courses: [{ name: 'Birvo Hills' }],
      match_fixtures: [{ id: 'a4000000-0000-4000-8000-000000000001', team1_id: UUIDS.team, team2_id: UUIDS.opponent }],
      tee_times: [{ starting_hole: 10, start_time: '17:30:00' }],
    };
    const reads = {};
    const client = {
      from(table) {
        calls.push(['from', table]);
        reads[table] = (reads[table] || 0) + 1;
        const query = {
          select(value) { calls.push(['select', table, value]); return query; },
          eq(column, value) { calls.push(['eq', table, column, value]); return query; },
          or(value) { calls.push(['or', table, value]); return query; },
          // The player card carries a season rank, so getPlayerHome also reads the
          // standings. Those queries order and await the builder directly.
          in(column, values) { calls.push(['in', table, column, values]); return query; },
          order(column, options) { calls.push(['order', table, column, options]); return query; },
          then(resolve, reject) {
            return Promise.resolve({ data: rows[table] || [], error: null }).then(resolve, reject);
          },
          async maybeSingle() {
            const index = table === 'teams' ? reads[table] - 1 : 0;
            return { data: rows[table]?.[index] || null, error: null };
          },
        };
        return query;
      },
    };
    const home = await playerRepository.getPlayerHome(client, UUIDS.team);
    assert.equal(home.opponentName, 'Birdie Club');
    assert.equal(home.startingHole, 10);
    assert.ok(calls.some(call => call[0] === 'from' && call[1] === 'match_fixtures'));
    assert.equal(calls.some(call => call[0] === 'select' && call[2].split(',').includes('pin')), false);
  });

  await t.test('production rate limits use the service RPC with a one-way subject hash', async () => {
    const calls = [];
    const adminClient = {
      async rpc(name, parameters) {
        calls.push({ name, parameters });
        return { data: [{ allowed: true, remaining: 2, retry_after_seconds: 0 }], error: null };
      },
    };
    const result = await persistentRateLimit.checkDataRateLimit({
      adminClient,
      scope: 'admin_login',
      subject: '203.0.113.7:Owner@Example.com',
      maxRequests: 3,
      windowMs: 60_000,
    });
    assert.deepEqual(result, { allowed: true, remaining: 2, retryAfterSeconds: 0 });
    assert.equal(calls[0].name, 'consume_rate_limit');
    assert.match(calls[0].parameters.p_subject_hash, /^[0-9a-f]{64}$/);
    assert.equal(JSON.stringify(calls).includes('Owner@Example.com'), false);
  });

  await t.test('PostgreSQL readiness checks only the non-tenant schema marker', async () => {
    const calls = [];
    const query = {
      select(value) { calls.push(['select', value]); return query; },
      eq(column, value) { calls.push(['eq', column, value]); return query; },
      async maybeSingle() { return { data: { schema_version: 4 }, error: null }; },
    };
    const snapshot = await getSupabaseHealthSnapshot({
      from(table) { calls.push(['from', table]); return query; },
    });
    assert.equal(snapshot.ready, true);
    assert.deepEqual(snapshot.schemaVersion, { current: 4, expected: 4 });
    assert.deepEqual(calls[0], ['from', 'app_metadata']);
    assert.equal(JSON.stringify(calls).match(/course|league|user/gi), null);
  });

  await t.test('PostgreSQL readiness failures disclose no provider details', async () => {
    const snapshot = await getSupabaseHealthSnapshot({
      from() { throw new Error('secret project and tenant data'); },
    });
    assert.equal(snapshot.ready, false);
    assert.doesNotMatch(JSON.stringify(snapshot), /secret|project|tenant/i);
  });

  await t.test('repository failures use a stable error contract without leaking provider messages', async () => {
    const client = {
      async rpc() {
        return { data: null, error: { code: '42501', message: 'sensitive database policy detail' } };
      },
    };
    await assert.rejects(
      operationsRepository.requestScoreCorrection(client, {
        courseId: UUIDS.course, scoreId: UUIDS.score, requestedGrossScore: 72, reason: 'Card correction',
      }),
      error => error instanceof SupabaseDataError
        && error.code === '42501'
        && !error.message.includes('sensitive database policy detail')
    );
  });

  await t.test('repository UUID validation rejects legacy or malformed cross-boundary IDs', async () => {
    await assert.rejects(
      workspaceRepository.listActiveLeagues({ from() { throw new Error('must not query'); } }, '../course'),
      error => error instanceof SupabaseDataError && error.code === 'INVALID_UUID'
    );
    await assert.rejects(
      operationsRepository.rotatePublicLink({ rpc() { throw new Error('must not call'); } }, {
        courseId: UUIDS.course, leagueId: '12', purpose: 'standings',
      }),
      error => error instanceof SupabaseDataError && error.code === 'INVALID_UUID'
    );
  });
});
