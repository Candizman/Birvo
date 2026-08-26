import db from '../../../lib/database';
import { getAdminContext } from '../../../lib/auth';
import HandicapView from './HandicapView';
import EmptyState from '../../../components/ui/EmptyState';

export default async function HandicapsAdminPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to manage league handicaps." primaryHref="/login" primaryLabel="Sign in" />;
  if (!context.leagueId) return <EmptyState title="No active league selected" description="Create or select an active league before managing handicaps." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;

  const { createAdminClient } = require('../../../lib/supabase/admin');
  const adminClient = createAdminClient();
  const { getHandicapViewDataAsync } = require('../../../lib/services/handicapService');

  const { teams, auditLogs } = await getHandicapViewDataAsync(db, adminClient, context.leagueId);

  return (
    <HandicapView teams={teams} auditLogs={auditLogs} />
  );
}
