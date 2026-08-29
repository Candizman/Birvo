import { getAdminContext } from '../../../lib/auth';
import RapidEntryForm from './RapidEntryForm';
import EmptyState from '../../../components/ui/EmptyState';
import { createClient } from '../../../lib/supabase/server';

export default async function RapidEntry() {
  const context = await getAdminContext();

  if (!context) {
    return <div style={{padding:'2rem', color:'white'}}>Sign in to continue.</div>;
  }

  const { getScoringWorkspace } = require('../../../lib/services/courseSetupService');
  const readiness = await getScoringWorkspace(await createClient(), {
    courseId: context.courseId,
    leagueId: context.leagueId,
    weekNumber: context.currentWeek,
  });

  if (!readiness.readyForScoring) {
    return <EmptyState eyebrow="Setup required" title="Complete launch checks before scoring" description="Birvo blocks score entry until the course layout, tee ratings, league roster, and first scheduled round are valid." primaryHref="/admin" primaryLabel="Review launch checklist" steps={readiness.blockers.map(item => item.description)} />;
  }

  const teams = readiness.teams || [];

  return (
    <div className="container" style={{ maxWidth: '100%', padding: '0 1rem' }}>
      <RapidEntryForm teams={teams} />
    </div>
  );
}
