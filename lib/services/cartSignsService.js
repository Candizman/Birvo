const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const cartSignsRepository = require('../data/supabase/cartSignsRepository');

async function getCartSignsDataAsync(db, adminClient, courseId, leagueId, selectedWeek) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const { course, league } = await cartSignsRepository.getCourseAndLeague(adminClient, courseId, leagueId);
    
    if (!course || !league) {
      return { course: null, league: null, activeTeams: [], teeTimes: [], fixtures: [] };
    }

    const [activeTeams, teeTimes, fixtures] = await Promise.all([
      cartSignsRepository.getActiveTeams(adminClient, leagueId),
      cartSignsRepository.getTeeTimesForWeek(adminClient, leagueId, selectedWeek),
      cartSignsRepository.getFixturesForWeek(adminClient, leagueId, selectedWeek)
    ]);

    return { course, league, activeTeams, teeTimes, fixtures };
  }

  // SQLite fallback
  const course = db.prepare('SELECT name, city FROM courses WHERE id = ?').get(courseId);
  const league = db.prepare('SELECT id, name, current_week FROM leagues WHERE id = ? AND course_id = ?').get(leagueId, courseId);
  
  if (!course || !league) {
    return { course: null, league: null, activeTeams: [], teeTimes: [], fixtures: [] };
  }

  const activeTeams = db.prepare("SELECT id, name, current_handicap FROM teams WHERE league_id = ? AND status = 'active' ORDER BY id ASC").all(leagueId);

  const teeTimes = db.prepare(`
    SELECT
      tt.id, tt.starting_hole, tt.starting_group, tt.start_time,
      t1.name as team1_name, t1.current_handicap as team1_hcp,
      t2.name as team2_name, t2.current_handicap as team2_hcp
    FROM tee_times tt
    LEFT JOIN teams t1 ON tt.team1_id = t1.id
    LEFT JOIN teams t2 ON tt.team2_id = t2.id
    WHERE tt.league_id = ? AND tt.week_number = ?
    ORDER BY tt.starting_hole ASC, tt.starting_group ASC
  `).all(leagueId, selectedWeek);

  const fixtures = db.prepare(`
    SELECT
      mf.id, mf.scheduled_time,
      t1.name as team1_name, t1.current_handicap as team1_hcp,
      t2.name as team2_name, t2.current_handicap as team2_hcp,
      mf.is_bye
    FROM match_fixtures mf
    LEFT JOIN teams t1 ON mf.team1_id = t1.id
    LEFT JOIN teams t2 ON mf.team2_id = t2.id
    WHERE mf.league_id = ? AND mf.week_number = ?
    ORDER BY mf.id ASC
  `).all(leagueId, selectedWeek);

  return { course, league, activeTeams, teeTimes, fixtures };
}

module.exports = {
  getCartSignsDataAsync
};
