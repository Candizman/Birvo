import db from '../../../lib/database';
import { getAdminContext, COURSE_MANAGEMENT_ROLES, SCORING_OPERATION_ROLES, hasAdminRole } from '../../../lib/auth';
import EmptyState from '../../../components/ui/EmptyState';
import CorrectionView from './CorrectionView';

export default async function CorrectionsPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to access score corrections." primaryHref="/login" primaryLabel="Sign in" />;
  if (!hasAdminRole(context.role, SCORING_OPERATION_ROLES)) return <EmptyState eyebrow="Restricted area" title="Scoring access required" description="Your role cannot request or review score corrections." primaryHref="/admin" primaryLabel="Back to overview" />;
  if (!context.leagueId) return <EmptyState title="No active league selected" description="Create or select an active league before reviewing corrections." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;
  const lockedScores = db.prepare(`SELECT s.id,s.gross_score,m.week_number,t.name AS team_name FROM scores s JOIN matches m ON m.id=s.match_id JOIN leagues l ON l.id=m.league_id JOIN teams t ON t.id=s.team_id WHERE l.course_id=? AND l.id=? AND m.locked_at IS NOT NULL ORDER BY m.week_number DESC,t.name`).all(context.courseId, context.leagueId);
  const requests = db.prepare(`SELECT r.*,s.gross_score AS old_gross,m.week_number,t.name AS team_name FROM score_correction_requests r JOIN scores s ON s.id=r.score_id JOIN matches m ON m.id=s.match_id JOIN leagues l ON l.id=m.league_id JOIN teams t ON t.id=s.team_id WHERE r.course_id=? AND l.id=? ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC LIMIT 100`).all(context.courseId, context.leagueId);
  return <CorrectionView lockedScores={lockedScores} requests={requests} canReview={hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)} />;
}
