const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');
const leagueRepository = require('./leagueRepository');

async function maybeSingle(query, operation) {
  return unwrapSupabaseResult(await query.maybeSingle(), operation);
}

async function getActiveLeagueContext(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'player league scope');
  const league = await maybeSingle(
    client.from('leagues').select('id,name,course_id,game_format,current_week')
      .eq('id', normalizedLeagueId).eq('status', 'active'),
    'read public league'
  );
  if (!league) return null;
  const course = await maybeSingle(
    client.from('courses').select('name,city').eq('id', league.course_id),
    'read public course'
  );
  return course ? { league, course } : null;
}

async function listActiveLeagueTeams(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'player roster scope');
  const result = await client.from('teams').select('id,name')
    .eq('league_id', normalizedLeagueId).eq('status', 'active').order('name', { ascending: true });
  return unwrapSupabaseResult(result, 'read player roster') || [];
}

async function getPlayerLoginTeam(client, { teamId, leagueId }) {
  const normalizedTeamId = requireUuid(teamId, 'player login team scope');
  const normalizedLeagueId = requireUuid(leagueId, 'player login league scope');
  return maybeSingle(
    client.from('teams').select('id,league_id,pin').eq('id', normalizedTeamId)
      .eq('league_id', normalizedLeagueId).eq('status', 'active'),
    'read player login team'
  );
}

async function getPlayerHome(client, teamId) {
  const normalizedTeamId = requireUuid(teamId, 'player home team scope');
  const team = await maybeSingle(
    client.from('teams').select('id,name,current_handicap,league_id,course_id')
      .eq('id', normalizedTeamId).eq('status', 'active'),
    'read player home team'
  );
  if (!team) return null;
  const league = await maybeSingle(
    client.from('leagues').select('id,name,current_week,course_id').eq('id', team.league_id).eq('status', 'active'),
    'read player home league'
  );
  if (!league || league.course_id !== team.course_id) return null;
  const course = await maybeSingle(
    client.from('courses').select('name').eq('id', team.course_id),
    'read player home course'
  );
  if (!course) return null;

  const fixture = await maybeSingle(
    client.from('match_fixtures').select('id,team1_id,team2_id,scheduled_date,scheduled_time')
      .eq('course_id', team.course_id).eq('league_id', team.league_id)
      .eq('week_number', league.current_week)
      .or(`team1_id.eq.${normalizedTeamId},team2_id.eq.${normalizedTeamId}`),
    'read player fixture'
  );
  const opponentId = fixture
    ? (fixture.team1_id === normalizedTeamId ? fixture.team2_id : fixture.team1_id)
    : null;
  const opponent = opponentId
    ? await maybeSingle(client.from('teams').select('name').eq('id', opponentId), 'read player opponent')
    : null;
  const teeTime = await maybeSingle(
    client.from('tee_times').select('starting_hole,start_time')
      .eq('course_id', team.course_id).eq('league_id', team.league_id)
      .eq('week_number', league.current_week)
      .or(`team1_id.eq.${normalizedTeamId},team2_id.eq.${normalizedTeamId}`),
    'read player tee time'
  );

  // The player card shows a season rank. Without this the card always read "—",
  // because the SQLite implementation computed it and the PostgreSQL one never did.
  let teamSeasonData = null;
  try {
    const standings = await leagueRepository.getLeagueStandingsData(client, {
      courseId: team.course_id,
      leagueId: team.league_id,
    });
    teamSeasonData = standings?.seasonStandings?.find(row => row.id === team.id) || null;
  } catch {
    // A standings failure must not take the whole player portal down with it.
    teamSeasonData = null;
  }

  return {
    team,
    league,
    course,
    fixture,
    opponentName: opponent?.name || (fixture ? 'Open / Bye' : 'Not assigned'),
    startingHole: teeTime?.starting_hole || null,
    teamSeasonData,
  };
}

async function getPlayerLiveScorecard(client, teamId) {
  const home = await getPlayerHome(client, teamId);
  if (!home || !home.fixture) return home ? { ...home, match: null, courseHoles: [], clubs: [], existingScore: null, existingHoleDetails: {} } : null;
  const match = await maybeSingle(
    client.from('matches').select('id,course_id,league_id,week_number,status,locked_at')
      .eq('course_id', home.team.course_id).eq('league_id', home.team.league_id)
      .eq('week_number', home.league.current_week),
    'read player scorecard match'
  );
  if (!match) return { ...home, match: null, courseHoles: [], clubs: [], existingScore: null, existingHoleDetails: {} };
  const [holesResult, existingScore] = await Promise.all([
    client.from('course_holes').select('id,hole_number,par,stroke_index,pin_position')
      .eq('course_id', home.team.course_id).order('hole_number', { ascending: true }),
    maybeSingle(
      client.from('scores').select('id,gross_score,net_score,attestation_status')
        .eq('course_id', home.team.course_id).eq('match_id', match.id).eq('team_id', home.team.id),
      'read existing player score'
    ),
  ]);
  const courseHoles = unwrapSupabaseResult(holesResult, 'read player course holes') || [];
  let existingHoleDetails = {};
  if (existingScore) {
    const detailsResult = await client.from('score_hole_details')
      .select('hole_number,gross_score,putts,penalty_strokes,fairway_hit,gir,sand_saves')
      .eq('course_id', home.team.course_id).eq('score_id', existingScore.id);
    const details = unwrapSupabaseResult(detailsResult, 'read existing hole scores') || [];
    existingHoleDetails = Object.fromEntries(details.map(item => [item.hole_number, item]));
  }
  return {
    ...home,
    team: { ...home.team, current_week: home.league.current_week, course_id: home.team.course_id, league_name: home.league.name },
    match,
    courseHoles,
    existingScore,
    existingHoleDetails,
  };
}

async function getPlayerScoreOpponent(client, { teamId, scoreId }) {
  const normalizedTeamId = requireUuid(teamId, 'player opponent team scope');
  const normalizedScoreId = requireUuid(scoreId, 'player opponent score scope');
  const score = await maybeSingle(
    client.from('scores').select('id,team_id,match_id,course_id')
      .eq('id', normalizedScoreId).eq('team_id', normalizedTeamId),
    'read player score for attestation'
  );
  if (!score) return null;
  const match = await maybeSingle(
    client.from('matches').select('id,league_id,week_number,locked_at')
      .eq('id', score.match_id).eq('course_id', score.course_id),
    'read player attestation match'
  );
  if (!match || match.locked_at) return null;
  const fixture = await maybeSingle(
    client.from('match_fixtures').select('team1_id,team2_id')
      .eq('course_id', score.course_id).eq('league_id', match.league_id).eq('week_number', match.week_number)
      .or(`team1_id.eq.${normalizedTeamId},team2_id.eq.${normalizedTeamId}`),
    'read player attestation fixture'
  );
  if (!fixture) return null;
  const opponentId = fixture.team1_id === normalizedTeamId ? fixture.team2_id : fixture.team1_id;
  if (!opponentId) return null;
  const opponent = await maybeSingle(
    client.from('teams').select('id,pin').eq('id', opponentId)
      .eq('league_id', match.league_id).eq('status', 'active'),
    'read attesting team credential'
  );
  return opponent ? { score, match, opponent } : null;
}

async function getPlayerProfile(client, teamId) {
  const normalizedTeamId = requireUuid(teamId, 'player profile team scope');
  const team = await maybeSingle(
    client.from('teams').select('id,name,current_handicap,ghin_number,league_id,course_id')
      .eq('id', normalizedTeamId).eq('status', 'active'),
    'read player profile team'
  );
  if (!team) return null;
  const [profileResult, badgesResult, clubsResult, notesResult, scoresResult] = await Promise.all([
    client.from('player_profiles').select(
      'id,team_id,bio,avatar_url,favorite_club,handicap_goal,theme_preference,language,created_at'
    ).eq('course_id', team.course_id).eq('team_id', team.id).maybeSingle(),
    client.from('player_badges').select('id,badge_key,badge_title,badge_icon,awarded_at')
      .eq('course_id', team.course_id).eq('team_id', team.id).order('awarded_at', { ascending: false }),
    client.from('player_bag_clubs').select('id,club_name,brand,avg_distance_yards,created_at')
      .eq('course_id', team.course_id).eq('team_id', team.id).order('avg_distance_yards', { ascending: false }),
    client.from('round_notes').select('id,week_number,notes,created_at')
      .eq('course_id', team.course_id).eq('team_id', team.id).order('week_number', { ascending: false }),
    client.from('scores').select('gross_score,net_score,created_at,matches!inner(week_number)')
      .eq('course_id', team.course_id).eq('team_id', team.id).order('created_at', { ascending: true }),
  ]);
  const storedProfile = unwrapSupabaseResult(profileResult, 'read player profile');
  const scores = (unwrapSupabaseResult(scoresResult, 'read player score history') || []).map(item => ({
    gross_score: Number(item.gross_score),
    net_score: Number(item.net_score),
    week_number: Number(item.matches?.week_number),
    created_at: item.created_at,
  }));
  return {
    team: { ...team, current_handicap: Number(team.current_handicap) },
    profile: storedProfile ? {
      ...storedProfile,
      handicap_goal: storedProfile.handicap_goal === null ? 5 : Number(storedProfile.handicap_goal),
    } : {
      id: null,
      team_id: team.id,
      bio: '',
      avatar_url: null,
      favorite_club: '',
      handicap_goal: 5,
      theme_preference: 'system',
      language: 'en-US',
      created_at: null,
    },
    badges: unwrapSupabaseResult(badgesResult, 'read player badges') || [],
    clubs: unwrapSupabaseResult(clubsResult, 'read player bag') || [],
    roundNotes: unwrapSupabaseResult(notesResult, 'read player round notes') || [],
    scores,
  };
}

async function requestPinReset(client, { teamId, email, tokenHash }) {
  const normalizedTeamId = requireUuid(teamId, 'pin reset team scope');
  const result = await client.rpc('request_team_pin_reset', {
    p_team_id: normalizedTeamId,
    p_email: email,
    p_token_hash: tokenHash
  });
  return unwrapSupabaseResult(result, 'request team pin reset') === true;
}

async function executePinReset(client, { teamId, tokenHash, newPinHash }) {
  const normalizedTeamId = requireUuid(teamId, 'pin reset execution team scope');
  const result = await client.rpc('execute_team_pin_reset', {
    p_team_id: normalizedTeamId,
    p_token_hash: tokenHash,
    p_new_pin_hash: newPinHash
  });
  return unwrapSupabaseResult(result, 'execute team pin reset') === true;
}

async function disputeScore(client, { scoreId, reason }) {
  const normalizedScoreId = requireUuid(scoreId, 'dispute score scope');
  const result = await client.rpc('submit_score_dispute', {
    p_score_id: normalizedScoreId,
    p_reason: reason
  });
  return unwrapSupabaseResult(result, 'submit score dispute') === true;
}

module.exports = {
  getActiveLeagueContext,
  getPlayerHome,
  getPlayerLiveScorecard,
  getPlayerLoginTeam,
  getPlayerProfile,
  getPlayerScoreOpponent,
  listActiveLeagueTeams,
  requestPinReset,
  executePinReset,
  disputeScore,
};
