import { getAdminContext } from '../../../lib/auth';
import HandicapView from './HandicapView';
import EmptyState from '../../../components/ui/EmptyState';
import handicapRepository from '../../../lib/data/supabase/handicapRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

export default async function HandicapsAdminPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to manage league handicaps." primaryHref="/login" primaryLabel="Sign in" />;
  if (!context.leagueId) return <EmptyState title="No active league selected" description="Create or select an active league before managing handicaps." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;

  const adminClient = createAdminClient();
  const [teams, auditLogs] = await Promise.all([
    handicapRepository.getTeamsForHandicapView(adminClient, context.leagueId),
    handicapRepository.getHandicapAuditLogs(adminClient, context.leagueId),
  ]);

  return (
    <HandicapView teams={teams} auditLogs={auditLogs} />
  );
}
