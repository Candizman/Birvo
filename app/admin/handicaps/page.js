import db from '../../../lib/database';
import { getAdminContext } from '../../../lib/auth';
import HandicapView from './HandicapView';
import EmptyState from '../../../components/ui/EmptyState';

export default async function HandicapsAdminPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to manage league handicaps." primaryHref="/login" primaryLabel="Sign in" />;
  if (!context.leagueId) return <EmptyState title="No active league selected" description="Create or select an active league before managing handicaps." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;

  const teams = db.prepare(`
    SELECT t.id, t.name, t.current_handicap, t.low_handicap_365, t.ghin_number
    FROM teams t
    WHERE t.league_id = ? AND t.status = 'active'
    ORDER BY t.current_handicap ASC
  `).all(context.leagueId);

  const auditLogs = db.prepare(`
    SELECT
      hal.*,
      t.name as team_name
    FROM handicap_audit_logs hal
    JOIN teams t ON hal.team_id = t.id
    WHERE t.league_id = ?
    ORDER BY hal.created_at DESC
    LIMIT 100
  `).all(context.leagueId);

  return (
    <HandicapView teams={teams} auditLogs={auditLogs} />
  );
}
