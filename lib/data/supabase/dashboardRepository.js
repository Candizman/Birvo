const { buildCourseSetupProgress } = require('../../services/courseSetupService');
const { buildRoundCloseReadiness } = require('../../services/roundLifecycleService');
const { buildLeagueStandings } = require('../../domain/standings');
const { fetchFormatInputs } = require('./formatInputs');
const { unwrapSupabaseResult } = require('./errors');
const { requireUuid } = require('./workspaceRepository');

async function maybeSingle(query, operation) {
  return unwrapSupabaseResult(await query.maybeSingle(), operation);
}

async function getScopedCourse(client, courseId) {
  const normalizedCourseId = requireUuid(courseId, 'dashboard course scope');
  return maybeSingle(
    client.from('courses')
      .select('id,name,city,state,postal_code,timezone,primary_color')
      .eq('id', normalizedCourseId),
    'read dashboard course'
  );
}

async function getScopedActiveLeague(client, { courseId, leagueId }) {
  const normalizedCourseId = requireUuid(courseId, 'dashboard league course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'dashboard league scope');
  return maybeSingle(
    client.from('leagues')
      .select('id,course_id,name,current_week,game_format,season_length_weeks,status')
      .eq('id', normalizedLeagueId)
      .eq('course_id', normalizedCourseId)
      .eq('status', 'active'),
    'read dashboard league'
  );
}

async function getAdminDashboardSnapshot(client, { courseId, leagueId }) {
  const normalizedCourseId = requireUuid(courseId, 'dashboard course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'dashboard league scope');
  const [course, league] = await Promise.all([
    getScopedCourse(client, normalizedCourseId),
    getScopedActiveLeague(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId }),
  ]);
  if (!course || !league) return { course, league, standingsData: null, setupProgress: null, recentScores: [], needsReviewCount: 0 };

  const [teamsResult, matchesResult, holesResult, teeBoxesResult] = await Promise.all([
    client.from('teams').select('id,name,current_handicap,status')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .eq('status', 'active').order('name', { ascending: true }),
    client.from('matches').select('id,week_number,status,locked_at')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .order('week_number', { ascending: true }),
    // par is here for stableford, which scores each hole against it.
    client.from('course_holes').select('id,hole_number,par,stroke_index')
      .eq('course_id', normalizedCourseId).order('hole_number', { ascending: true }),
    client.from('course_tee_boxes').select('id').eq('course_id', normalizedCourseId),
  ]);
  const teams = unwrapSupabaseResult(teamsResult, 'read dashboard teams') || [];
  const matches = unwrapSupabaseResult(matchesResult, 'read dashboard matches') || [];
  const holes = unwrapSupabaseResult(holesResult, 'read dashboard course holes') || [];
  const teeBoxes = unwrapSupabaseResult(teeBoxesResult, 'read dashboard tee boxes') || [];
  const matchIds = matches.map(match => match.id);
  let scores = [];
  if (matchIds.length > 0) {
    const scoresResult = await client.from('scores')
      .select('id,match_id,team_id,gross_score,handicap_used,net_score,attestation_status,reconciliation_status,is_ghost,substitute_id,created_at')
      .eq('course_id', normalizedCourseId)
      .in('match_id', matchIds)
      .order('created_at', { ascending: false });
    scores = unwrapSupabaseResult(scoresResult, 'read dashboard scores') || [];
  }

  const teamById = new Map(teams.map(team => [team.id, team]));
  const recentScores = scores.slice(0, 5).map(score => {
    const team = teamById.get(score.team_id);
    return {
      gross_score: score.gross_score,
      net_score: score.net_score,
      attestation_status: score.attestation_status,
      reconciliation_status: score.reconciliation_status,
      created_at: score.created_at,
      team_name: team?.name || 'Unknown team',
      current_handicap: team?.current_handicap ?? null,
    };
  });

  // The dashboard must score a league the same way its public standings does,
  // or the admin and the members read different results off the same round.
  const formatInputs = await fetchFormatInputs(client, {
    courseId: normalizedCourseId, leagueId: league.id, league, scores, courseHoles: holes,
  });

  return {
    course,
    league,
    standingsData: buildLeagueStandings({ league, teams, matches, scores, ...formatInputs }),
    setupProgress: buildCourseSetupProgress({ course, league, holes, teeBoxes, teams, matches }),
    recentScores,
    needsReviewCount: scores.filter(score => score.reconciliation_status === 'needs_review').length,
  };
}

async function getLeagueOperationsSnapshot(client, { courseId, leagueId, weekNumber }) {
  const normalizedCourseId = requireUuid(courseId, 'operations course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'operations league scope');
  const league = await getScopedActiveLeague(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId });
  if (!league) return { league: null, readiness: null };

  const [teamsResult, match] = await Promise.all([
    client.from('teams').select('id').eq('course_id', normalizedCourseId)
      .eq('league_id', normalizedLeagueId).eq('status', 'active'),
    maybeSingle(
      client.from('matches').select('id,status,locked_at')
        .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
        .eq('week_number', weekNumber),
      'read operations round'
    ),
  ]);
  const teams = unwrapSupabaseResult(teamsResult, 'read operations teams') || [];
  let scores = [];
  if (match) {
    const scoresResult = await client.from('scores')
      .select('attestation_status,reconciliation_status')
      .eq('course_id', normalizedCourseId).eq('match_id', match.id);
    scores = unwrapSupabaseResult(scoresResult, 'read operations scores') || [];
  }
  return {
    league,
    readiness: buildRoundCloseReadiness({ match, activeTeams: teams.length, scores }),
  };
}

module.exports = {
  getAdminDashboardSnapshot,
  getLeagueOperationsSnapshot,
  getScopedActiveLeague,
  getScopedCourse,
};
