const dataBackend = require('../data/backend');
const db = require('../database');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const dashboardRepository = require('../data/supabase/dashboardRepository');

async function getAdminDashboardAsync(client, courseId, leagueId) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    if (!leagueId) {
      const course = await dashboardRepository.getScopedCourse(client, courseId);
      return { course, league: null };
    }
    const snapshot = await dashboardRepository.getAdminDashboardSnapshot(client, { courseId, leagueId });
    const publicAccessRepository = require('../data/supabase/publicAccessRepository');
    const linkVersions = await publicAccessRepository.getPublicLinkVersions(client, { courseId, leagueId, purposes: ['standings', 'tv'] });

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

  // SQLite fallback
  const course = db.prepare("SELECT name, city, state, postal_code, timezone, primary_color FROM courses WHERE id = ?").get(courseId);
  if (!course) return { course: null, league: null };

  const league = leagueId 
    ? db.prepare("SELECT id, name, current_week, game_format, season_length_weeks FROM leagues WHERE id = ? AND course_id = ? AND status = 'active'").get(leagueId, courseId)
    : null;
  
  if (!league) return { course, league: null };

  const needsReviewCount = db.prepare(`
    SELECT COUNT(*) as c FROM scores s
    JOIN matches m ON s.match_id = m.id
    WHERE m.league_id = ? AND s.reconciliation_status = 'needs_review'
  `).get(league.id).c;

  const recentScores = db.prepare(`
    SELECT s.gross_score, s.net_score, s.attestation_status, s.reconciliation_status, s.created_at, t.name as team_name, t.current_handicap
    FROM scores s
    JOIN teams t ON s.team_id = t.id
    JOIN matches m ON s.match_id = m.id
    WHERE m.league_id = ?
    ORDER BY s.created_at DESC
    LIMIT 5
  `).all(league.id);

  const { getLeagueStandings } = require('../services/standingsService');
  const { getCourseSetupProgress } = require('../services/courseSetupService');
  
  const standingsData = getLeagueStandings(db, league.id);
  const setupProgress = getCourseSetupProgress(db, courseId, league.id);

  const { getPublicLinkVersion } = require('../publicAccess');
  const linkVersions = {
    standings: getPublicLinkVersion(db, league.id, 'standings'),
    tv: getPublicLinkVersion(db, league.id, 'tv'),
  };

  return {
    course,
    league,
    needsReviewCount,
    recentScores,
    standingsData,
    setupProgress,
    linkVersions
  };
}

async function getLeagueOperationsAsync(client, courseId, leagueId, weekNumber) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const snapshot = await dashboardRepository.getLeagueOperationsSnapshot(client, { courseId, leagueId, weekNumber });
    const publicAccessRepository = require('../data/supabase/publicAccessRepository');
    const linkVersions = await publicAccessRepository.getPublicLinkVersions(client, { courseId, leagueId });
    return {
      league: snapshot.league,
      readiness: snapshot.readiness,
      linkVersions
    };
  }

  const db = require('../database');
  const league = leagueId 
    ? db.prepare('SELECT id, name FROM leagues WHERE id = ? AND course_id = ? AND status = ?').get(leagueId, courseId, 'active')
    : null;

  const { getRoundCloseReadiness } = require('../services/roundLifecycleService');
  const readiness = league ? getRoundCloseReadiness(db, league.id, weekNumber) : null;

  const { getPublicLinkVersion } = require('../publicAccess');
  const linkVersions = league ? {
    standings: getPublicLinkVersion(db, league.id, 'standings'),
    tv: getPublicLinkVersion(db, league.id, 'tv'),
    player: getPublicLinkVersion(db, league.id, 'player'),
  } : null;

  return { league, readiness, linkVersions };
}

module.exports = {
  getAdminDashboardAsync,
  getLeagueOperationsAsync
};
