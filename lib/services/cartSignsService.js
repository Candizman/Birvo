const cartSignsRepository = require('../data/supabase/cartSignsRepository');

async function getCartSignsData(adminClient, courseId, leagueId, selectedWeek) {
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

module.exports = {
  getCartSignsData
};
