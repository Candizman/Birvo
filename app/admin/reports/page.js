import { getAdminContext } from '../../../lib/auth';
import ReportsView from './ReportsView';

export default async function ReportsAdminPage() {
  const context = await getAdminContext();
  if (!context || !context.leagueId) {
    return <div style={{ padding: '2rem', color: 'white' }}>Please select or create a league to continue.</div>;
  }

  const { createAdminClient } = require('../../../lib/supabase/admin');
  const adminClient = createAdminClient();
  const { getLeagueAsync } = require('../../../lib/services/leagueService');
  const league = await getLeagueAsync(adminClient, context.leagueId);

  const { getCourseHoleDifficultyStatsAsync, getHoleHeatmapAsync, getWeeklyDigestAsync } = require('../../../lib/services/reportService');
  const difficultyStats = await getCourseHoleDifficultyStatsAsync(adminClient, context.courseId);
  const heatmap = await getHoleHeatmapAsync(adminClient, context.courseId);
  const weeklyDigest = await getWeeklyDigestAsync(adminClient, context.leagueId, context.currentWeek);

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
