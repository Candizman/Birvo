'use server'

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createPlayerSessionToken, SESSION_TTL_SECONDS } from '../../../lib/playerSession';
import { hashTeamPin, isHashedTeamPin, verifyTeamPin } from '../../../lib/security/pin';
import entityIds from '../../../lib/security/entityId';
import persistentRateLimit from '../../../lib/data/persistentRateLimit';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { checkDataRateLimit } = persistentRateLimit;
const { validatePublicLeagueAccess } = publicAccessRepository;
const { getPlayerLoginTeam } = playerRepository;
const { upgradePlayerPinHash } = operationsRepository;

function parseEntityId(value) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export async function playerLogin(formData) {
  const teamId = parseEntityId(formData.get('teamId'));
  const leagueId = parseEntityId(formData.get('leagueId'));
  const access = formData.get('access')?.trim() || '';
  const pin = formData.get('pin')?.trim();
  const retryUrl = leagueId
    ? `/player/login?leagueId=${leagueId}&access=${encodeURIComponent(access)}&error=1`
    : '/player/login?error=1';

  if (!teamId || !leagueId || !/^\d{4}$/.test(pin || '')) redirect(retryUrl);

  const requestHeaders = await headers();
  const source = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || requestHeaders.get('x-real-ip')
    || 'unknown';
  const adminClient = createAdminClient();
  let rateLimit;
  try {
    rateLimit = await checkDataRateLimit({
      adminClient,
      scope: `player_login:${leagueId}`,
      subject: `${source}:${teamId}`,
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
    });
  } catch {
    redirect(retryUrl);
  }
  if (!rateLimit.allowed) redirect(retryUrl);

  let team = null;
  try {
    const hasAccess = adminClient
      && await validatePublicLeagueAccess(adminClient, access, { leagueId, purpose: 'player' });
    team = hasAccess ? await getPlayerLoginTeam(adminClient, { teamId, leagueId }) : null;
  } catch {
    team = null;
  }

  if (!team || !verifyTeamPin(pin, team.pin)) redirect(retryUrl);

  if (!isHashedTeamPin(team.pin)) {
    const pinHash = hashTeamPin(pin);
    try {
      await upgradePlayerPinHash(adminClient, { teamId: team.id, pinHash });
    } catch {
      redirect(retryUrl);
    }
  }

  const cookieStore = await cookies();
  cookieStore.set('player_session', createPlayerSessionToken(team.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect('/player');
}
