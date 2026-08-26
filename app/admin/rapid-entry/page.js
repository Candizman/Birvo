import db from '../../../lib/database';
import { getAdminContext } from '../../../lib/auth';
import RapidEntryForm from './RapidEntryForm';
import EmptyState from '../../../components/ui/EmptyState';
import { getCourseSetupProgress } from '../../../lib/services/courseSetupService';
import dataBackend from '../../../lib/data/backend';
import workspaceRepository from '../../../lib/data/supabase/workspaceRepository';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export default async function RapidEntry() {
  const context = await getAdminContext();

  if (!context) {
    return <div style={{padding:'2rem', color:'white'}}>Sign in to continue.</div>;
  }

  const activeDataBackend = resolveDataBackend();
  const scoringWorkspace = activeDataBackend === DATA_BACKENDS.SUPABASE
    ? await workspaceRepository.getScoringWorkspace(await createClient(), {
        courseId: context.courseId, leagueId: context.leagueId, weekNumber: context.currentWeek,
      })
    : null;
  const readiness = scoringWorkspace || getCourseSetupProgress(db, context.courseId, context.leagueId);
  if (!readiness.readyForScoring) {
    return <EmptyState eyebrow="Setup required" title="Complete launch checks before scoring" description="Birvo blocks score entry until the course layout, tee ratings, league roster, and first scheduled round are valid." primaryHref="/admin" primaryLabel="Review launch checklist" steps={readiness.blockers.map(item => item.description)} />;
  }

  const teams = scoringWorkspace?.teams
    || db.prepare("SELECT id, name, current_handicap FROM teams WHERE league_id = ? AND status = 'active' ORDER BY name").all(context.leagueId);

  return (
    <div className="container" style={{ maxWidth: '100%', padding: '0 1rem' }}>
      <RapidEntryForm teams={teams} />
    </div>
  );
}
