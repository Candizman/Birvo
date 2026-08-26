'use server'

import db from '../../../lib/database';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createPlayerSessionToken, SESSION_TTL_SECONDS } from '../../../lib/playerSession';
import { hashTeamPin, isHashedTeamPin, verifyTeamPin } from '../../../lib/security/pin';
import { hasPublicLeagueAccess } from '../../../lib/publicAccess';
import dataBackend from '../../../lib/data/backend';
import entityIds from '../../../lib/security/entityId';
import persistentRateLimit from '../../../lib/data/persistentRateLimit';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { checkDataRateLimit } = persistentRateLimit;
const { validatePublicLeagueAccess } = publicAccessRepository;
const { getPlayerLoginTeam } = playerRepository;
const { upgradePlayerPinHash } = operationsRepository;

function parseEntityId(value, backend) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  if (backend === DATA_BACKENDS.SUPABASE) return UUID_PATTERN.test(normalized) ? normalized : null;
  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

export async function playerLogin(formData) {
  const activeDataBackend = resolveDataBackend();
  const teamId = parseEntityId(formData.get('teamId'), activeDataBackend);
  const leagueId = parseEntityId(formData.get('leagueId'), activeDataBackend);
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
  const adminClient = activeDataBackend === DATA_BACKENDS.SUPABASE ? createAdminClient() : null;
  let rateLimit;
  try {
    rateLimit = await checkDataRateLimit({
      backend: activeDataBackend,
      sqliteDb: db,
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
    const hasAccess = activeDataBackend === DATA_BACKENDS.SUPABASE
      ? adminClient && await validatePublicLeagueAccess(adminClient, access, { leagueId, purpose: 'player' })
      : hasPublicLeagueAccess(access, { leagueId, purpose: 'player', db });
    team = hasAccess
      ? (activeDataBackend === DATA_BACKENDS.SUPABASE
          ? await getPlayerLoginTeam(adminClient, { teamId, leagueId })
          : db.prepare("SELECT id, league_id, pin FROM teams WHERE id = ? AND league_id = ? AND status = 'active'").get(teamId, leagueId))
      : null;
  } catch {
    team = null;
  }

  if (!team || !verifyTeamPin(pin, team.pin)) redirect(retryUrl);

  if (!isHashedTeamPin(team.pin)) {
    const pinHash = hashTeamPin(pin);
    try {
      if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
        await upgradePlayerPinHash(adminClient, { teamId: team.id, pinHash });
      } else {
        db.prepare('UPDATE teams SET pin = ? WHERE id = ?').run(pinHash, team.id);
      }
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
