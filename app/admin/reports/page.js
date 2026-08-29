import { getAdminContext } from '../../../lib/auth';
import ReportsView from './ReportsView';

export default async function ReportsAdminPage() {
  const context = await getAdminContext();
  if (!context || !context.leagueId) {
    return <div style={{ padding: '2rem', color: 'white' }}>Please select or create a league to continue.</div>;
  }

  const { createAdminClient } = require('../../../lib/supabase/admin');
  const adminClient = createAdminClient();
  const { getLeague } = require('../../../lib/services/leagueService');
  const league = await getLeague(adminClient, context.leagueId);

  const { getCourseHoleDifficultyStats, getHoleHeatmap, getWeeklyDigest } = require('../../../lib/services/reportService');
  const difficultyStats = await getCourseHoleDifficultyStats(adminClient, context.courseId);
  const heatmap = await getHoleHeatmap(adminClient, context.courseId);
  const weeklyDigest = await getWeeklyDigest(adminClient, context.leagueId, context.currentWeek);

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
