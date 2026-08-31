import StandingsView from './StandingsView';
import { createPublicAccessToken } from '../../lib/publicAccess';
import publishingRepository from '../../lib/data/supabase/publishingRepository';
import publicAccessRepository from '../../lib/data/supabase/publicAccessRepository';
import { createAdminClient } from '../../lib/supabase/admin';
import entityIds from '../../lib/security/entityId';

const { UUID_PATTERN } = entityIds;

export default async function StandingsPage({ searchParams }) {
  const p = await searchParams;
  const requestedLeagueId = String(p?.leagueId || '').trim();
  const leagueId = UUID_PATTERN.test(requestedLeagueId) ? requestedLeagueId.toLowerCase() : null;

  let standingsData = null;
  let playerAccessToken = null;

  if (leagueId) {
    const adminClient = createAdminClient();
    const allowed = adminClient && await publicAccessRepository.validatePublicLeagueAccess(
      adminClient, p?.access, { leagueId, purpose: 'standings' }
    );
    if (allowed) {
      standingsData = await publishingRepository.getPublicStandingsSnapshot(adminClient, leagueId);
      const version = await publicAccessRepository.getPublicLinkVersion(adminClient, { leagueId, purpose: 'player' });
      playerAccessToken = createPublicAccessToken({ leagueId, purpose: 'player', version });
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <StandingsView standingsData={standingsData} playerAccessToken={playerAccessToken} isPreview={process.env.NODE_ENV !== 'production'} />
    </main>
  );
}
