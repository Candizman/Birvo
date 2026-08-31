import { NextResponse } from 'next/server';
import QRCode from 'qrcode';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';
import entityIds from '../../../lib/security/entityId';

const { UUID_PATTERN, normalizeEntityId } = entityIds;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawLeagueId = normalizeEntityId(searchParams.get('leagueId'));
  const access = searchParams.get('access');

  if (!rawLeagueId || !UUID_PATTERN.test(rawLeagueId)) {
    return NextResponse.json({ error: 'League ID is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Service credentials are not configured.' }, { status: 503 });
  }

  const allowed = await publicAccessRepository.validatePublicLeagueAccess(
    adminClient, access, { leagueId: rawLeagueId, purpose: 'player' }
  );
  const leagueContext = allowed ? await playerRepository.getActiveLeagueContext(adminClient, rawLeagueId) : null;
  if (!leagueContext) {
    return NextResponse.json({ error: 'Active league not found.' }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const joinUrl = `${baseUrl}/join/${rawLeagueId}?access=${encodeURIComponent(access || '')}`;

  const qrImage = await QRCode.toBuffer(joinUrl, {
    type: 'png',
    width: 300,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#123E31', light: '#FFFFFF' },
  });
  return new NextResponse(new Uint8Array(qrImage), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
