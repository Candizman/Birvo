import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import EmptyState from '../../../components/ui/EmptyState';
import RosterImportView from './RosterImportView';

export default async function RosterImportPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to import a roster." primaryHref="/login" primaryLabel="Sign in" />;
  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) return <EmptyState eyebrow="Restricted area" title="Course manager access required" description="Only course owners and managers can import teams." primaryHref="/admin" primaryLabel="Back to overview" />;
  const { listCourseLeaguesAsync } = require('../../../lib/services/leagueService');
  const { createClient } = require('../../../lib/supabase/server');
  const allLeagues = await listCourseLeaguesAsync(await createClient(), context.courseId);
  const leagues = allLeagues.filter(l => l.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  
  if (!leagues.length) return <EmptyState title="Create an active league first" description="Roster rows must be assigned to a league." primaryHref="/admin/leagues" primaryLabel="Create league" />;
  return <RosterImportView leagues={leagues} defaultLeagueId={context.leagueId || leagues[0].id} />;
}
