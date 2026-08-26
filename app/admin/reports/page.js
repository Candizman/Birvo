import db from '../../../lib/database';
import { getAdminContext } from '../../../lib/auth';
import { getCourseHoleDifficultyStats, getHoleHeatmap, getWeeklyDigest } from '../../../lib/services/reportService';
import ReportsView from './ReportsView';

export default async function ReportsAdminPage() {
  const context = await getAdminContext();
  if (!context || !context.leagueId) {
    return <div style={{ padding: '2rem', color: 'white' }}>Please select or create a league to continue.</div>;
  }

  const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(context.leagueId);
  const difficultyStats = getCourseHoleDifficultyStats(db, context.courseId);
  const heatmap = getHoleHeatmap(db, context.courseId);
  const weeklyDigest = getWeeklyDigest(db, context.leagueId, context.currentWeek);

  return (
    <ReportsView
      league={league}
      difficultyStats={difficultyStats}
      heatmap={heatmap}
      weeklyDigest={weeklyDigest}
      currentWeek={context.currentWeek}
    />
  );
}
