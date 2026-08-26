import db from '../../../lib/database';
import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import EmptyState from '../../../components/ui/EmptyState';
import { getTVDisplayData } from '../../../lib/services/tvService';
import { createPublicAccessToken, getPublicLinkVersion as getLocalPublicLinkVersion } from '../../../lib/publicAccess';
import dataBackend from '../../../lib/data/backend';
import publishingRepository from '../../../lib/data/supabase/publishingRepository';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import { createClient } from '../../../lib/supabase/server';
import PublishingControls from './PublishingControls';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export default async function PublishingPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to manage clubhouse publishing." primaryHref="/login" primaryLabel="Sign in" />;
  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) {
    return <EmptyState eyebrow="Restricted area" title="Course manager access required" description="Only course owners and managers can change public broadcast settings." primaryHref="/admin" primaryLabel="Back to overview" />;
  }
  if (!context.leagueId) return <EmptyState title="No active league to publish" description="Create or select an active league before configuring Clubhouse TV." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;

  const backend = resolveDataBackend();
  const usesSupabase = backend === DATA_BACKENDS.SUPABASE;
  const client = usesSupabase ? await createClient() : null;
  const snapshot = usesSupabase
    ? await publishingRepository.getPublishingManagementSnapshot(client, { courseId: context.courseId, leagueId: context.leagueId })
    : getTVDisplayData(db, context.leagueId);
  if (!snapshot) return <EmptyState title="Publishing workspace unavailable" description="The selected league is not active or does not belong to this course." primaryHref="/admin/leagues" primaryLabel="Select league" />;

  const version = usesSupabase
    ? await publicAccessRepository.getPublicLinkVersion(client, { leagueId: context.leagueId, purpose: 'tv' })
    : getLocalPublicLinkVersion(db, context.leagueId, 'tv');
  const token = createPublicAccessToken({ leagueId: context.leagueId, purpose: 'tv', version });
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const tvUrl = token ? `${baseUrl}/tv/${context.leagueId}?access=${encodeURIComponent(token)}` : null;
  return <PublishingControls leagueName={snapshot.league.name} display={snapshot.display} sponsors={snapshot.sponsors} tvUrl={tvUrl} />;
}
