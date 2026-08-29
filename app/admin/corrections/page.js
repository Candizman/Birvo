import { getAdminContext, COURSE_MANAGEMENT_ROLES, SCORING_OPERATION_ROLES, hasAdminRole } from '../../../lib/auth';
import EmptyState from '../../../components/ui/EmptyState';
import CorrectionView from './CorrectionView';

export default async function CorrectionsPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to access score corrections." primaryHref="/login" primaryLabel="Sign in" />;
  if (!hasAdminRole(context.role, SCORING_OPERATION_ROLES)) return <EmptyState eyebrow="Restricted area" title="Scoring access required" description="Your role cannot request or review score corrections." primaryHref="/admin" primaryLabel="Back to overview" />;
  if (!context.leagueId) return <EmptyState title="No active league selected" description="Create or select an active league before reviewing corrections." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;
  const { getCorrectionsAdminSnapshot } = require('../../../lib/services/correctionsService');
  const { createClient } = require('../../../lib/supabase/server');
  const { lockedScores, requests } = await getCorrectionsAdminSnapshot(await createClient(), context.courseId, context.leagueId);
  return <CorrectionView lockedScores={lockedScores} requests={requests} canReview={hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)} />;
}
