const reportRepository = require('../data/supabase/reportRepository');

/**
 * Quotes a value for CSV. A cell beginning with =, +, - or @ is prefixed with an
 * apostrophe so a spreadsheet treats it as text rather than evaluating it as a
 * formula, which is the standard CSV injection defence.
 */
function escapeCSVCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function getCourseHoleDifficultyStats(adminClient, courseId) {
  return reportRepository.getCourseHoleDifficultyStats(adminClient, courseId);
}

async function getPlayerFormTrend(adminClient, teamId) {
  return reportRepository.getPlayerFormTrend(adminClient, teamId);
}

async function getWeeklyDigest(adminClient, leagueId, weekNumber) {
  return reportRepository.getWeeklyDigest(adminClient, leagueId, weekNumber);
}

async function getHoleHeatmap(adminClient, courseId) {
  return reportRepository.getHoleHeatmap(adminClient, courseId);
}

/**
 * Season grid as CSV: one row per team, gross and net for every week that has a
 * round, plus the team's average net across the weeks it played.
 */
async function generateCSVExport(adminClient, leagueId) {
  const data = await reportRepository.getLeagueCSVData(adminClient, leagueId);
  if (!data.league) return '';

  const weeks = [...new Set(data.matches.map(m => m.week_number))].sort((a, b) => a - b);

  const header = [
    'Team Name',
    'Handicap Index',
    ...weeks.map(w => `Week ${w} Gross`),
    ...weeks.map(w => `Week ${w} Net`),
    'Average Net',
  ];
  const rows = [header.join(',')];

  for (const team of data.teams) {
    const teamScores = data.scores.filter(score => score.team_id === team.id);
    const scoreByWeek = {};
    teamScores.forEach(score => { scoreByWeek[score.matches.week_number] = score; });

    const grossCols = weeks.map(week => scoreByWeek[week]?.gross_score ?? '-');
    const netCols = weeks.map(week => scoreByWeek[week]?.net_score ?? '-');

    const validNets = teamScores
      .map(score => Number(score.net_score))
      .filter(value => Number.isFinite(value));
    const avgNet = validNets.length > 0
      ? (validNets.reduce((sum, value) => sum + value, 0) / validNets.length).toFixed(1)
      : '-';

    rows.push([
      escapeCSVCell(team.name),
      Number(team.current_handicap || 0).toFixed(1),
      ...grossCols,
      ...netCols,
      avgNet,
    ].join(','));
  }

  return rows.join('\r\n');
}

module.exports = {
  escapeCSVCell,
  getCourseHoleDifficultyStats,
  getPlayerFormTrend,
  getWeeklyDigest,
  getHoleHeatmap,
  generateCSVExport,
};
