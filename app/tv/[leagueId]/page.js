import db from '../../../lib/database';
import { getTVDisplayData } from '../../../lib/services/tvService';
import TVView from './TVView';
import Link from 'next/link';
import { createPublicAccessToken, getPublicLinkVersion as getLocalPublicLinkVersion, hasPublicLeagueAccess } from '../../../lib/publicAccess';
import dataBackend from '../../../lib/data/backend';
import publishingRepository from '../../../lib/data/supabase/publishingRepository';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import { createAdminClient } from '../../../lib/supabase/admin';
import entityIds from '../../../lib/security/entityId';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { UUID_PATTERN } = entityIds;

export default async function TVDisplayPage({ params, searchParams }) {
  const { leagueId } = await params;
  const query = await searchParams;
  const usesSupabase = resolveDataBackend() === DATA_BACKENDS.SUPABASE;
  const requestedLeagueId = String(leagueId || '').trim();
  const id = usesSupabase
    ? (UUID_PATTERN.test(requestedLeagueId) ? requestedLeagueId.toLowerCase() : null)
    : Number.parseInt(leagueId, 10);
  let tvData = null;
  let playerAccessToken = null;
  if (usesSupabase) {
    if (id) {
      const adminClient = createAdminClient();
      const allowed = adminClient && await publicAccessRepository.validatePublicLeagueAccess(
        adminClient, query?.access, { leagueId: id, purpose: 'tv' }
      );
      if (allowed) {
        tvData = await publishingRepository.getPublicTVSnapshot(adminClient, id);
        const version = await publicAccessRepository.getPublicLinkVersion(adminClient, { leagueId: id, purpose: 'player' });
        playerAccessToken = createPublicAccessToken({ leagueId: id, purpose: 'player', version });
      }
    }
  } else {
    const allowed = Number.isInteger(id) && id > 0 && hasPublicLeagueAccess(query?.access, { leagueId: id, purpose: 'tv', db });
    if (allowed) {
      tvData = getTVDisplayData(db, id);
      playerAccessToken = createPublicAccessToken({
        leagueId: id, purpose: 'player', version: getLocalPublicLinkVersion(db, id, 'player'),
      });
    }
  }

  if (!tvData) {
    return (
      <div style={{ minHeight: '100vh', background: '#060a12', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#62c88a' }}>Invalid Birvo TV link</h1>
        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>The requested league was not found or is not available for TV display.</p>
        <Link href="/admin" style={{ padding: '12px 24px', background: '#62c88a', color: '#06140f', fontWeight: 800, borderRadius: '8px', textDecoration: 'none' }}>
          Back to admin dashboard →
        </Link>
      </div>
    );
  }

  return <TVView tvData={{ ...tvData, playerAccessToken, isPreview: process.env.NODE_ENV !== 'production' }} />;
}
