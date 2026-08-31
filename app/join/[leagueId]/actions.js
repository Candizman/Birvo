'use server'

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { randomInt } from 'node:crypto';
import { hashTeamPin } from '../../../lib/security/pin';
import { createJoinReceiptToken, JOIN_RECEIPT_TTL_SECONDS } from '../../../lib/playerSession';
import entityIds from '../../../lib/security/entityId';
import persistentRateLimit from '../../../lib/data/persistentRateLimit';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { checkDataRateLimit } = persistentRateLimit;
const { validatePublicLeagueAccess } = publicAccessRepository;
const { getActiveLeagueContext } = playerRepository;
const { registerPlayerTeam } = operationsRepository;

function parseLeagueId(value) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export async function joinLeague(formData) {
  const leagueId = parseLeagueId(formData.get('leagueId'));
  const teamName = formData.get('teamName')?.trim();
  const access = formData.get('access')?.trim() || '';
  let handicap = Number.parseFloat(formData.get('handicap'));

  if (!Number.isFinite(handicap) || handicap < 0 || handicap > 54) handicap = 0;

  const retryUrl = leagueId
    ? `/join/${leagueId}?access=${encodeURIComponent(access)}&error=1`
    : '/?registrationError=1';
  if (!leagueId || !teamName || teamName.length < 2 || teamName.length > 50) redirect(retryUrl);

  const requestHeaders = await headers();
  const source = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || requestHeaders.get('x-real-ip')
    || 'unknown';
  const adminClient = createAdminClient();
  let rateLimit;
  try {
    rateLimit = await checkDataRateLimit({
      adminClient,
      scope: `league_join:${leagueId}`,
      subject: source,
      maxRequests: 5,
      windowMs: 60 * 60 * 1000,
    });
  } catch {
    redirect(retryUrl);
  }
  if (!rateLimit.allowed) redirect(retryUrl);

  try {
    const hasAccess = adminClient
      && await validatePublicLeagueAccess(adminClient, access, { leagueId, purpose: 'player' });
    const leagueContext = hasAccess ? await getActiveLeagueContext(adminClient, leagueId) : null;
    if (!leagueContext) redirect(retryUrl);
  } catch {
    redirect(retryUrl);
  }

  const pin = randomInt(1000, 10000).toString();
  const pinHash = hashTeamPin(pin);
  let teamId;
  try {
    teamId = await registerPlayerTeam(adminClient, { leagueId, teamName, handicap, pinHash });
  } catch {
    redirect(retryUrl);
  }

  const cookieStore = await cookies();
  cookieStore.set('join_receipt', createJoinReceiptToken({ teamId, leagueId, pin, access }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/join/${leagueId}`,
    maxAge: JOIN_RECEIPT_TTL_SECONDS,
  });

  redirect(`/join/${leagueId}/success`);
}
