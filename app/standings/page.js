import db from '../../lib/database';
import { getLeagueStandings } from '../../lib/services/standingsService';
import StandingsView from './StandingsView';
import { createPublicAccessToken, getPublicLinkVersion as getLocalPublicLinkVersion, hasPublicLeagueAccess } from '../../lib/publicAccess';
import dataBackend from '../../lib/data/backend';
import publishingRepository from '../../lib/data/supabase/publishingRepository';
import publicAccessRepository from '../../lib/data/supabase/publicAccessRepository';
import { createAdminClient } from '../../lib/supabase/admin';
import entityIds from '../../lib/security/entityId';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { UUID_PATTERN } = entityIds;

export default async function StandingsPage({ searchParams }) {
  const p = await searchParams;
  const backend = resolveDataBackend();
  const usesSupabase = backend === DATA_BACKENDS.SUPABASE;
  const requestedLeagueId = String(p?.leagueId || '').trim();
  let leagueId = usesSupabase
    ? (UUID_PATTERN.test(requestedLeagueId) ? requestedLeagueId.toLowerCase() : null)
    : (p?.leagueId ? Number.parseInt(p.leagueId, 10) : null);

  if (!usesSupabase && !leagueId) {
    const firstActiveLeague = db.prepare("SELECT id FROM leagues WHERE status = 'active' ORDER BY id ASC LIMIT 1").get();
    if (firstActiveLeague) {
      leagueId = firstActiveLeague.id;
    }
  }

  let standingsData = null;
  let playerAccessToken = null;
  if (leagueId) {
    if (usesSupabase) {
      const adminClient = createAdminClient();
      const allowed = adminClient && await publicAccessRepository.validatePublicLeagueAccess(
        adminClient, p?.access, { leagueId, purpose: 'standings' }
      );
      if (allowed) {
        standingsData = await publishingRepository.getPublicStandingsSnapshot(adminClient, leagueId);
        const version = await publicAccessRepository.getPublicLinkVersion(adminClient, { leagueId, purpose: 'player' });
        playerAccessToken = createPublicAccessToken({ leagueId, purpose: 'player', version });
      }
    } else {
      const allowed = hasPublicLeagueAccess(p?.access, { leagueId, purpose: 'standings', db });
      standingsData = allowed ? getLeagueStandings(db, leagueId) : null;
      playerAccessToken = allowed ? createPublicAccessToken({
        leagueId, purpose: 'player', version: getLocalPublicLinkVersion(db, leagueId, 'player'),
      }) : null;
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
      <StandingsView standingsData={standingsData} playerAccessToken={playerAccessToken} isPreview={process.env.NODE_ENV !== 'production'} />
    </main>
  );
}
