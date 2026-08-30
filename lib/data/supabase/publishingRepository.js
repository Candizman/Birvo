const { buildLeagueStandings } = require('../../domain/standings');
const { fetchFormatInputs } = require('./formatInputs');
const { getLeagueStandingsData, getScopedLeague } = require('./leagueRepository');
const { unwrapSupabaseResult } = require('./errors');
const { requireUuid } = require('./workspaceRepository');

const DEFAULT_TV_DISPLAY = Object.freeze({
  name: 'Birvo TV',
  template_type: 'leaderboard_ticker',
  auto_scroll_speed: 8,
  show_announcements: true,
  announcement_text: null,
  celebration_effects: false,
  sound_enabled: false,
});

async function getPublicLeagueContext(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'public league scope');
  const leagueResult = await client.from('leagues')
    .select('id,course_id,name,status,current_week,season_length_weeks,game_format')
    .eq('id', normalizedLeagueId).eq('status', 'active').maybeSingle();
  const league = unwrapSupabaseResult(leagueResult, 'read public league');
  if (!league) return null;

  const courseResult = await client.from('courses')
    .select('id,name,city,state,weather_lat,weather_lon')
    .eq('id', league.course_id).maybeSingle();
  const course = unwrapSupabaseResult(courseResult, 'read public league course');
  if (!course) return null;
  return { league: { ...league, course_name: course.name, course_city: course.city }, course };
}

async function getPublicStandingsSnapshot(client, leagueId) {
  const context = await getPublicLeagueContext(client, leagueId);
  if (!context) return null;
  const { league } = context;
  const [teamsResult, matchesResult] = await Promise.all([
    client.from('teams').select('id,name,current_handicap,status,created_at')
      .eq('course_id', league.course_id).eq('league_id', league.id)
      .eq('status', 'active').order('created_at', { ascending: true }),
    client.from('matches').select('id,week_number,status')
      .eq('course_id', league.course_id).eq('league_id', league.id)
      .order('week_number', { ascending: true }),
  ]);
  const teams = unwrapSupabaseResult(teamsResult, 'read public standings teams') || [];
  const matches = unwrapSupabaseResult(matchesResult, 'read public standings rounds') || [];
  let scores = [];
  let formatInputs = {};
  if (matches.length > 0) {
    const scoresResult = await client.from('scores')
      .select('id,match_id,team_id,gross_score,handicap_used,net_score,reconciliation_status,is_ghost')
      .eq('course_id', league.course_id).in('match_id', matches.map(match => match.id));
    scores = unwrapSupabaseResult(scoresResult, 'read public standings scores') || [];
    formatInputs = await fetchFormatInputs(client, {
      courseId: league.course_id, leagueId: league.id, league, scores,
    });
  }
  return buildLeagueStandings({ league, teams, matches, scores, ...formatInputs });
}

async function getPublicTVSnapshot(client, leagueId) {
  const standingsData = await getPublicStandingsSnapshot(client, leagueId);
  if (!standingsData) return null;
  const { league } = standingsData;
  const [displayResult, sponsorsResult] = await Promise.all([
    client.from('tv_displays')
      .select('id,league_id,name,template_type,auto_scroll_speed,show_announcements,announcement_text,celebration_effects,sound_enabled')
      .eq('course_id', league.course_id).eq('league_id', league.id)
      .order('created_at', { ascending: true }),
    client.from('tv_sponsors').select('id,name,logo_url,display_order')
      .eq('course_id', league.course_id).eq('league_id', league.id)
      .eq('active', true).order('display_order', { ascending: true }),
  ]);
  const displays = unwrapSupabaseResult(displayResult, 'read public TV settings') || [];
  const sponsors = unwrapSupabaseResult(sponsorsResult, 'read public TV sponsors') || [];
  return {
    league,
    display: displays[0] || { ...DEFAULT_TV_DISPLAY, league_id: league.id },
    sponsors,
    standings: standingsData.seasonStandings,
    weeklyResults: standingsData.weeklyResultsList,
    currentWeek: league.current_week,
    weather: null,
  };
}

async function getPublishingManagementSnapshot(client, { courseId, leagueId }) {
  const normalizedCourseId = requireUuid(courseId, 'publishing course scope');
  const normalizedLeagueId = requireUuid(leagueId, 'publishing league scope');
  const [league, standingsData, displayResult, sponsorsResult] = await Promise.all([
    getScopedLeague(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId, activeOnly: true }),
    getLeagueStandingsData(client, { courseId: normalizedCourseId, leagueId: normalizedLeagueId }),
    client.from('tv_displays')
      .select('id,league_id,name,template_type,auto_scroll_speed,show_announcements,announcement_text,celebration_effects,sound_enabled')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .order('created_at', { ascending: true }),
    client.from('tv_sponsors').select('id,name,logo_url,display_order,active')
      .eq('course_id', normalizedCourseId).eq('league_id', normalizedLeagueId)
      .order('display_order', { ascending: true }),
  ]);
  if (!league) return null;
  const displays = unwrapSupabaseResult(displayResult, 'read managed TV settings') || [];
  return {
    league,
    display: displays[0] || { ...DEFAULT_TV_DISPLAY, league_id: league.id },
    sponsors: unwrapSupabaseResult(sponsorsResult, 'read managed TV sponsors') || [],
    standings: standingsData?.seasonStandings || [],
  };
}

module.exports = {
  DEFAULT_TV_DISPLAY,
  getPublicLeagueContext,
  getPublicStandingsSnapshot,
  getPublicTVSnapshot,
  getPublishingManagementSnapshot,
};
