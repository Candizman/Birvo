const { getCourseDetails } = require('./courseService');

function escapeCSVCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function getCourseHoleDifficultyStats(db, courseId) {
  const details = getCourseDetails(db, courseId);
  const holes = details ? details.holes : [];
  if (holes.length === 0) return [];

  // Aggregate hole scores from score_hole_details
  const stats = holes.map(h => {
    const row = db.prepare(`
      SELECT
        COUNT(shd.gross_score) as totalPlayed,
        AVG(shd.gross_score) as avgGross,
        AVG(shd.putts) as avgPutts
      FROM score_hole_details shd
      JOIN scores s ON shd.score_id = s.id
      JOIN matches m ON s.match_id = m.id
      JOIN leagues l ON m.league_id = l.id
      WHERE l.course_id = ? AND shd.hole_number = ?
    `).get(courseId, h.hole_number);

    const hasData = row.totalPlayed > 0;
    const avgGross = hasData ? Number(row.avgGross.toFixed(2)) : null;
    const vsPar = hasData ? Number((row.avgGross - h.par).toFixed(2)) : null;

    return {
      holeNumber: h.hole_number,
      par: h.par,
      strokeIndex: h.stroke_index,
      avgGross,
      avgPutts: hasData && row.avgPutts != null ? Number(row.avgPutts.toFixed(2)) : null,
      vsPar,
      totalPlayed: row.totalPlayed || 0
    };
  });

  // Rank by vsPar descending (hardest = highest score over par)
  const ranked = stats.filter((item) => item.totalPlayed > 0).sort((a, b) => b.vsPar - a.vsPar);
  ranked.forEach((r, idx) => {
    r.actualDifficultyRank = idx + 1;
  });

  return stats.sort((a, b) => a.holeNumber - b.holeNumber);
}

function getPlayerFormTrend(db, teamId) {
  const scores = db.prepare(`
    SELECT s.net_score, m.week_number
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    WHERE s.team_id = ? AND s.reconciliation_status = 'ok' AND s.net_score IS NOT NULL
    ORDER BY m.week_number DESC
    LIMIT 5
  `).all(teamId);

  if (scores.length < 2) {
    return { trend: 'stable', label: '⚖️ Neutral', description: 'Insufficient round history.' };
  }

  // Look at last score vs previous avg
  const recent = scores[0].net_score;
  const pastAvg = scores.slice(1).reduce((sum, s) => sum + s.net_score, 0) / (scores.length - 1);
  const diff = pastAvg - recent; // positive = improving (lower net score)

  if (diff >= 2.0) {
    return { trend: 'hot', label: '🔥 Trending Up (Improving)', description: `Last round was ${diff.toFixed(1)} strokes better than average.` };
  } else if (diff <= -2.0) {
    return { trend: 'cold', label: '❄️ Trending Down', description: `Last round was ${Math.abs(diff).toFixed(1)} strokes above average.` };
  }
  return { trend: 'stable', label: '⚖️ Consistent', description: 'Scores are trending consistently.' };
}

function getWeeklyDigest(db, leagueId, weekNumber) {
  const scores = db.prepare(`
    SELECT s.*, t.name as team_name, t.current_handicap
    FROM scores s
    JOIN teams t ON s.team_id = t.id
    JOIN matches m ON s.match_id = m.id
    WHERE m.league_id = ? AND m.week_number = ? AND s.reconciliation_status = 'ok'
    ORDER BY s.net_score ASC
  `).all(leagueId, weekNumber);

  if (scores.length === 0) return null;

  const netChampion = scores[0]; // lowest net

  // Gross champion
  const sortedByGross = [...scores].sort((a, b) => a.gross_score - b.gross_score);
  const grossChampion = sortedByGross[0];

  const leagueAvgNet = Number((scores.reduce((sum, s) => sum + s.net_score, 0) / scores.length).toFixed(1));

  return {
    weekNumber,
    totalPlayers: scores.length,
    netChampion: { name: netChampion.team_name, netScore: netChampion.net_score, grossScore: netChampion.gross_score },
    grossChampion: { name: grossChampion.team_name, grossScore: grossChampion.gross_score },
    leagueAvgNet
  };
}

function generateCSVExport(db, leagueId) {
  const league = db.prepare('SELECT name FROM leagues WHERE id = ?').get(leagueId);
  const teams = db.prepare("SELECT id, name, current_handicap FROM teams WHERE league_id = ? AND status = 'active' ORDER BY name ASC").all(leagueId);
  const matches = db.prepare('SELECT DISTINCT week_number FROM matches WHERE league_id = ? ORDER BY week_number ASC').all(leagueId);

  const header = ['Team Name', 'Handicap Index', ...matches.map(m => `Week ${m.week_number} Gross`), ...matches.map(m => `Week ${m.week_number} Net`), 'Average Net'];
  const rows = [header.join(',')];

  for (const t of teams) {
    const scores = db.prepare(`
      SELECT s.gross_score, s.net_score, m.week_number
      FROM scores s
      JOIN matches m ON s.match_id = m.id
      WHERE s.team_id = ? AND m.league_id = ?
    `).all(t.id, leagueId);

    const scoreMap = {};
    scores.forEach(s => scoreMap[s.week_number] = s);

    const grossCols = matches.map(m => scoreMap[m.week_number]?.gross_score || '-');
    const netCols = matches.map(m => scoreMap[m.week_number]?.net_score || '-');

    const validNets = scores.map(s => s.net_score).filter(value => value != null);
    const avgNet = validNets.length > 0 ? (validNets.reduce((a, b) => a + b, 0) / validNets.length).toFixed(1) : '-';

    const row = [
      escapeCSVCell(t.name),
      Number(t.current_handicap || 0).toFixed(1),
      ...grossCols,
      ...netCols,
      avgNet
    ];
    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}

function getHoleHeatmap(db, courseId) {
  const details = getCourseDetails(db, courseId);
  const holes = details ? details.holes : [];

  return holes.map(h => {
    const rows = db.prepare(`
      SELECT shd.gross_score
      FROM score_hole_details shd
      JOIN scores s ON shd.score_id = s.id
      JOIN matches m ON s.match_id = m.id
      JOIN leagues l ON m.league_id = l.id
      WHERE l.course_id = ? AND shd.hole_number = ?
    `).all(courseId, h.hole_number);

    let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0;
    rows.forEach(r => {
      const diff = r.gross_score - h.par;
      if (diff <= -2) eagles++;
      else if (diff === -1) birdies++;
      else if (diff === 0) pars++;
      else if (diff === 1) bogeys++;
      else doubles++;
    });

    const total = rows.length || 1;
    return {
      holeNumber: h.hole_number,
      par: h.par,
      totalPlayed: rows.length,
      birdiePct: Number(((birdies / total) * 100).toFixed(0)),
      parPct: Number(((pars / total) * 100).toFixed(0)),
      bogeyPct: Number(((bogeys / total) * 100).toFixed(0)),
      doublePct: Number(((doubles / total) * 100).toFixed(0))
    };
  });
}

module.exports = {
  getCourseHoleDifficultyStats,
  getPlayerFormTrend,
  getWeeklyDigest,
  generateCSVExport,
  getHoleHeatmap
};
