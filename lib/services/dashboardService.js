const dashboardRepository = require('../data/supabase/dashboardRepository');
const publicAccessRepository = require('../data/supabase/publicAccessRepository');

async function getAdminDashboard(client, courseId, leagueId) {
  if (!leagueId) {
    const course = await dashboardRepository.getScopedCourse(client, courseId);
    return { course, league: null };
  }

  const snapshot = await dashboardRepository.getAdminDashboardSnapshot(client, { courseId, leagueId });
  const linkVersions = await publicAccessRepository.getPublicLinkVersions(client, {
    courseId, leagueId, purposes: ['standings', 'tv'],
  });

  return {
    course: snapshot.course,
    league: snapshot.league,
    standingsData: snapshot.standingsData,
    setupProgress: snapshot.setupProgress,
    needsReviewCount: snapshot.needsReviewCount,
    recentScores: snapshot.recentScores,
    linkVersions
  };
}

async function getLeagueOperations(client, courseId, leagueId, weekNumber) {
  const snapshot = await dashboardRepository.getLeagueOperationsSnapshot(client, { courseId, leagueId, weekNumber });
  const linkVersions = await publicAccessRepository.getPublicLinkVersions(client, { courseId, leagueId });
  return {
    league: snapshot.league,
    readiness: snapshot.readiness,
    linkVersions
  };
}

module.exports = {
  getAdminDashboard,
  getLeagueOperations
};
