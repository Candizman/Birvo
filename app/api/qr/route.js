import { NextResponse } from 'next/server';
import db from '../../../lib/database';
import { hasPublicLeagueAccess } from '../../../lib/publicAccess';
import QRCode from 'qrcode';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId');
  const access = searchParams.get('access');

  if (!leagueId) {
    return NextResponse.json({ error: 'League ID is required.' }, { status: 400 });
  }

  const league = db.prepare("SELECT id FROM leagues WHERE id = ? AND status = 'active'").get(parseInt(leagueId));
  if (!league || !hasPublicLeagueAccess(access, { leagueId: league.id, purpose: 'player', db })) {
    return NextResponse.json({ error: 'Active league not found.' }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const joinUrl = `${baseUrl}/join/${leagueId}?access=${encodeURIComponent(access || '')}`;

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
