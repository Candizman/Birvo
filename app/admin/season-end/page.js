import { getAdminContext } from '../../../lib/auth';
import { getSeasonEndStatus } from '../../../lib/services/seasonEndService';
import { createClient } from '../../../lib/supabase/server';
import EmptyState from '../../../components/ui/EmptyState';
import SeasonEndView from './SeasonEndView';

export default async function SeasonEndPage() {
  const context = await getAdminContext();
  if (!context || !context.leagueId) {
    return <EmptyState title="No League Selected" description="Please select a league to view its season end status." />;
  }

  const status = await getSeasonEndStatus(await createClient(), {
    courseId: context.courseId,
    leagueId: context.leagueId,
  });

  if (!status.isSeasonComplete) {
    return (
      <div style={{ padding: '2rem' }}>
        <EmptyState
          eyebrow="Season in Progress"
          title="Season Not Yet Complete"
          description={`The season is currently at week ${status.completedWeeks} out of ${status.totalWeeks}. Complete all weeks to crown a champion.`}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <SeasonEndView
        champion={status.champion}
        runnerUp={status.runnerUp}
        standings={status.standings}
        league={status.league}
        totalWeeks={status.totalWeeks}
      />
    </div>
  );
}
