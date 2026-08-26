'use server'

import db from '../../../lib/database';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { randomInt } from 'node:crypto';
import { hashTeamPin } from '../../../lib/security/pin';
import { createJoinReceiptToken, JOIN_RECEIPT_TTL_SECONDS } from '../../../lib/playerSession';
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
const { getActiveLeagueContext } = playerRepository;
const { registerPlayerTeam } = operationsRepository;

function parseLeagueId(value, backend) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  if (backend === DATA_BACKENDS.SUPABASE) return UUID_PATTERN.test(normalized) ? normalized : null;
  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

export async function joinLeague(formData) {
  const activeDataBackend = resolveDataBackend();
  const leagueId = parseLeagueId(formData.get('leagueId'), activeDataBackend);
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
  const adminClient = activeDataBackend === DATA_BACKENDS.SUPABASE ? createAdminClient() : null;
  let rateLimit;
  try {
    rateLimit = await checkDataRateLimit({
      backend: activeDataBackend,
      sqliteDb: db,
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
    const hasAccess = activeDataBackend === DATA_BACKENDS.SUPABASE
      ? adminClient && await validatePublicLeagueAccess(adminClient, access, { leagueId, purpose: 'player' })
      : hasPublicLeagueAccess(access, { leagueId, purpose: 'player', db });
    const leagueContext = hasAccess
      ? (activeDataBackend === DATA_BACKENDS.SUPABASE
          ? await getActiveLeagueContext(adminClient, leagueId)
          : db.prepare("SELECT id, course_id FROM leagues WHERE id = ? AND status = 'active'").get(leagueId))
      : null;
    if (!leagueContext) redirect(retryUrl);
  } catch {
    redirect(retryUrl);
  }

  const pin = randomInt(1000, 10000).toString();
  const pinHash = hashTeamPin(pin);
  let teamId;
  try {
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      teamId = await registerPlayerTeam(adminClient, { leagueId, teamName, handicap, pinHash });
    } else {
      const league = db.prepare('SELECT course_id FROM leagues WHERE id = ?').get(leagueId);
      const result = db.prepare(
        'INSERT INTO teams (course_id, league_id, name, current_handicap, low_handicap_365, pin) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(league.course_id, leagueId, teamName, handicap, handicap, pinHash);
      teamId = Number(result.lastInsertRowid);
    }
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
