const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');

async function getCourseHoleDifficultyStats(client, courseId) {
  const normalizedCourseId = requireUuid(courseId, 'report course scope');

  // We fetch holes and aggregate scores. Since PostgREST doesn't support complex group by easily,
  // we can use a database view or an RPC. Or we can fetch raw details and aggregate in memory.
  // Wait, let's fetch the raw course holes, and then the raw score_hole_details for this course.
  
  const holesResult = await client.from('course_holes').select('hole_number,par,stroke_index')
    .eq('course_id', normalizedCourseId).order('hole_number', { ascending: true });
  
  const holes = unwrapSupabaseResult(holesResult, 'read course holes for stats') || [];
  if (holes.length === 0) return [];

  // Fetch all hole scores for this course. To limit it to active matches/leagues,
  // we should join with matches/leagues. But since course_id is directly on scores, 
  // we can just fetch all scores for the course.
  const detailsResult = await client.from('score_hole_details').select('hole_number,gross_score,putts')
    .eq('course_id', normalizedCourseId);
    
  const details = unwrapSupabaseResult(detailsResult, 'read hole details for stats') || [];

  const aggregates = {};
  holes.forEach(h => { aggregates[h.hole_number] = { totalPlayed: 0, sumGross: 0, sumPutts: 0, puttsCount: 0 }; });

  details.forEach(d => {
    if (aggregates[d.hole_number]) {
      aggregates[d.hole_number].totalPlayed++;
      aggregates[d.hole_number].sumGross += Number(d.gross_score);
      if (d.putts != null) {
        aggregates[d.hole_number].sumPutts += Number(d.putts);
        aggregates[d.hole_number].puttsCount++;
      }
    }
  });

  const stats = holes.map(h => {
    const agg = aggregates[h.hole_number];
    const hasData = agg.totalPlayed > 0;
    const avgGross = hasData ? Number((agg.sumGross / agg.totalPlayed).toFixed(2)) : null;
    const vsPar = hasData ? Number((avgGross - h.par).toFixed(2)) : null;
    
    return {
      holeNumber: h.hole_number,
      par: h.par,
      strokeIndex: h.stroke_index,
      avgGross,
      avgPutts: agg.puttsCount > 0 ? Number((agg.sumPutts / agg.puttsCount).toFixed(2)) : null,
      vsPar,
      totalPlayed: agg.totalPlayed
    };
  });

  const ranked = stats.filter(item => item.totalPlayed > 0).sort((a, b) => b.vsPar - a.vsPar);
  ranked.forEach((r, idx) => { r.actualDifficultyRank = idx + 1; });

  return stats.sort((a, b) => a.holeNumber - b.holeNumber);
}

async function getHoleHeatmap(client, courseId) {
  const normalizedCourseId = requireUuid(courseId, 'heatmap course scope');

  const holesResult = await client.from('course_holes').select('hole_number,par')
    .eq('course_id', normalizedCourseId).order('hole_number', { ascending: true });
  const holes = unwrapSupabaseResult(holesResult, 'read course holes for heatmap') || [];

  const detailsResult = await client.from('score_hole_details').select('hole_number,gross_score')
    .eq('course_id', normalizedCourseId);
  const details = unwrapSupabaseResult(detailsResult, 'read hole details for heatmap') || [];

  const aggregates = {};
  holes.forEach(h => { aggregates[h.hole_number] = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0, total: 0 }; });

  details.forEach(d => {
    const hole = holes.find(h => h.hole_number === d.hole_number);
    if (hole && aggregates[d.hole_number]) {
      const diff = Number(d.gross_score) - hole.par;
      const agg = aggregates[d.hole_number];
      agg.total++;
      if (diff <= -2) agg.eagles++;
      else if (diff === -1) agg.birdies++;
      else if (diff === 0) agg.pars++;
      else if (diff === 1) agg.bogeys++;
      else agg.doubles++;
    }
  });

  return holes.map(h => {
    const agg = aggregates[h.hole_number];
    const total = agg.total || 1;
    return {
      holeNumber: h.hole_number,
      par: h.par,
      totalPlayed: agg.total,
      birdiePct: Number(((agg.birdies / total) * 100).toFixed(0)),
      parPct: Number(((agg.pars / total) * 100).toFixed(0)),
      bogeyPct: Number(((agg.bogeys / total) * 100).toFixed(0)),
      doublePct: Number(((agg.doubles / total) * 100).toFixed(0))
    };
  });
}

async function getPlayerFormTrend(client, teamId) {
  const normalizedTeamId = requireUuid(teamId, 'trend team scope');
  
  const result = await client.from('scores')
    .select('net_score, matches!inner(week_number)')
    .eq('team_id', normalizedTeamId)
    .eq('reconciliation_status', 'ok')
    .not('net_score', 'is', null)
    .order('matches(week_number)', { ascending: false })
    .limit(5);

  const scores = unwrapSupabaseResult(result, 'read player form trend') || [];
  
  // Sort descending by week just in case
  scores.sort((a, b) => b.matches.week_number - a.matches.week_number);

  if (scores.length < 2) {
    return { trend: 'stable', label: '⚖️ Neutral', description: 'Insufficient round history.' };
  }

  const recent = Number(scores[0].net_score);
  const pastAvg = scores.slice(1).reduce((sum, s) => sum + Number(s.net_score), 0) / (scores.length - 1);
  const diff = pastAvg - recent; // positive = improving

  if (diff >= 2.0) {
    return { trend: 'hot', label: '🔥 Trending Up (Improving)', description: `Last round was ${diff.toFixed(1)} strokes better than average.` };
  } else if (diff <= -2.0) {
    return { trend: 'cold', label: '❄️ Trending Down', description: `Last round was ${Math.abs(diff).toFixed(1)} strokes above average.` };
  }
  return { trend: 'stable', label: '⚖️ Consistent', description: 'Scores are trending consistently.' };
}

async function getWeeklyDigest(client, leagueId, weekNumber) {
  const normalizedLeagueId = requireUuid(leagueId, 'digest league scope');

  // We need to fetch scores and teams for a specific week and league where reconciliation_status='ok'
  // using inner join on matches to filter by week.
  const result = await client.from('scores')
    .select('gross_score, net_score, teams!inner(name, current_handicap), matches!inner(id)')
    .eq('matches.league_id', normalizedLeagueId)
    .eq('matches.week_number', weekNumber)
    .eq('reconciliation_status', 'ok');

  const scoresRaw = unwrapSupabaseResult(result, 'read weekly digest') || [];
  
  if (scoresRaw.length === 0) return null;

  const scores = scoresRaw.map(s => ({
    team_name: s.teams.name,
    gross_score: Number(s.gross_score),
    net_score: Number(s.net_score),
    current_handicap: s.teams.current_handicap
  }));

  scores.sort((a, b) => a.net_score - b.net_score);
  const netChampion = scores[0];

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

async function getLeagueCSVData(client, leagueId) {
  const normalizedLeagueId = requireUuid(leagueId, 'csv export league scope');

  const [leagueResult, teamsResult, matchesResult, scoresResult] = await Promise.all([
    client.from('leagues').select('name').eq('id', normalizedLeagueId).single(),
    client.from('teams').select('id, name, current_handicap').eq('league_id', normalizedLeagueId).eq('status', 'active').order('name', { ascending: true }),
    client.from('matches').select('week_number').eq('league_id', normalizedLeagueId).order('week_number', { ascending: true }),
    client.from('scores').select('team_id, gross_score, net_score, matches!inner(league_id, week_number)').eq('matches.league_id', normalizedLeagueId)
  ]);

  return {
    league: unwrapSupabaseResult(leagueResult, 'read csv league') || null,
    teams: unwrapSupabaseResult(teamsResult, 'read csv teams') || [],
    matches: unwrapSupabaseResult(matchesResult, 'read csv matches') || [],
    scores: unwrapSupabaseResult(scoresResult, 'read csv scores') || []
  };
}

module.exports = {
  getCourseHoleDifficultyStats,
  getHoleHeatmap,
  getPlayerFormTrend,
  getWeeklyDigest,
  getLeagueCSVData
};
