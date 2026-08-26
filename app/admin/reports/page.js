import db from '../../../lib/database';
import { getAdminContext } from '../../../lib/auth';
import ReportsView from './ReportsView';

export default async function ReportsAdminPage() {
  const context = await getAdminContext();
  if (!context || !context.leagueId) {
    return <div style={{ padding: '2rem', color: 'white' }}>Please select or create a league to continue.</div>;
  }

  const { createAdminClient } = require('../../../lib/supabase/admin');
  const adminClient = createAdminClient();

  const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(context.leagueId);
  const difficultyStats = await require('../../../lib/services/reportService').getCourseHoleDifficultyStatsAsync(db, adminClient, context.courseId);
  const heatmap = await require('../../../lib/services/reportService').getHoleHeatmapAsync(db, adminClient, context.courseId);
  const weeklyDigest = await require('../../../lib/services/reportService').getWeeklyDigestAsync(db, adminClient, context.leagueId, context.currentWeek);

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
