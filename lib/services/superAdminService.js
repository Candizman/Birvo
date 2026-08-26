const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const superAdminRepository = require('../data/supabase/superAdminRepository');

async function getPlatformStatsAsync(db, adminClient) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    return superAdminRepository.getPlatformStats(adminClient);
  }

  // SQLite fallback
  const courses = db.prepare('SELECT id, name, city FROM courses').all();

  const coursesWithStats = courses.map(course => {
    const leaguesCount = db.prepare('SELECT COUNT(*) as count FROM leagues WHERE course_id = ?').get(course.id).count;
    const teamsCount = db.prepare(`
      SELECT COUNT(*) as count FROM teams t
      JOIN leagues l ON t.league_id = l.id
      WHERE l.course_id = ?
    `).get(course.id).count;
    return { ...course, leaguesCount, teamsCount };
  });

  return coursesWithStats;
}

module.exports = {
  getPlatformStatsAsync
};
