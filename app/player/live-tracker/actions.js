'use server'

import { getPlayerSession } from '../../../lib/auth';
import { hashTeamPin, isHashedTeamPin, verifyTeamPin } from '../../../lib/security/pin';
import dataBackend from '../../../lib/data/backend';
import entityIds from '../../../lib/security/entityId';
import { createAdminClient } from '../../../lib/supabase/admin';
import { revalidatePath } from 'next/cache';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { UUID_PATTERN, normalizeEntityId } = entityIds;

function parseEntityId(value, backend) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  if (backend === DATA_BACKENDS.SUPABASE) return UUID_PATTERN.test(normalized) ? normalized : null;
  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

function readHoleDetails(formData) {
  const holes = [];
  for (let holeNumber = 1; holeNumber <= 36; holeNumber += 1) {
    const grossValue = formData.get(`hole_${holeNumber}_gross`);
    if (grossValue === null || grossValue === '') continue;
    const grossScore = Number(grossValue);
    const putts = Number(formData.get(`hole_${holeNumber}_putts`) ?? 0);
    if (!Number.isInteger(grossScore) || grossScore < 1 || grossScore > 20
      || !Number.isInteger(putts) || putts < 0 || putts > 10) return null;
    holes.push({
      holeNumber,
      grossScore,
      putts,
      fairwayHit: formData.get(`hole_${holeNumber}_fairway`) === '1',
      sandSave: formData.get(`hole_${holeNumber}_sand`) === '1',
      penaltyStrokes: 0,
    });
  }
  return holes.length ? holes : null;
}

export async function submitLiveRound(formData) {
  const session = await getPlayerSession();
  if (!session?.teamId) return { error: 'Authentication required.' };

  const activeDataBackend = resolveDataBackend();
  const matchId = parseEntityId(formData.get('matchId'), activeDataBackend);
  const weekNumber = Number(formData.get('weekNumber'));
  const photoUrl = formData.get('photoUrl')?.trim() || null;
  const holes = readHoleDetails(formData);
  if (!matchId || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 52 || !holes) {
    return { error: 'Enter a valid score for every published hole.' };
  }

  try {
    const adminClient = createAdminClient();
    const { submitLiveRoundAsync } = require('../../../lib/services/liveScoringService');
    const result = await submitLiveRoundAsync(adminClient, session, matchId, weekNumber, holes, photoUrl);
    revalidatePath('/player');
    revalidatePath('/player/live-tracker');
    revalidatePath('/standings');
    return { success: true, ...result };
  } catch (error) {
    return { error: error.message || 'The scorecard could not be saved. Confirm that the round is open and try again.' };
  }
}

export async function attestOwnScoreAction(formData) {
  const session = await getPlayerSession();
  if (!session?.teamId) return { error: 'Authentication required.' };
  const activeDataBackend = resolveDataBackend();
  const scoreId = parseEntityId(formData.get('scoreId'), activeDataBackend);
  const pin = formData.get('pin')?.trim();
  if (!scoreId || !/^\d{4}$/.test(pin || '')) return { error: 'Enter the assigned opponent’s four-digit PIN.' };

  try {
    const adminClient = createAdminClient();
    const { attestOwnScoreActionAsync } = require('../../../lib/services/liveScoringService');
    await attestOwnScoreActionAsync(adminClient, session, scoreId, pin);
    revalidatePath('/player');
    revalidatePath('/player/live-tracker');
    revalidatePath('/standings');
    return { success: true };
  } catch (error) {
    return { error: error.message || 'The scorecard could not be attested. Try again.' };
  }
}

export async function disputeScoreAction(formData) {
  const session = await getPlayerSession();
  if (!session?.teamId) return { error: 'Authentication required.' };
  const activeDataBackend = resolveDataBackend();
  try {
    const adminClient = createAdminClient();
    const scoreId = parseEntityId(formData.get('scoreId'), activeDataBackend);
    const reason = formData.get('reason')?.trim();
    const { disputeScoreActionAsync } = require('../../../lib/services/liveScoringService');
    await disputeScoreActionAsync(adminClient, session, scoreId, reason);
    revalidatePath('/player');
    revalidatePath('/admin/reconciliation');
    return { success: true };
  } catch (error) {
    return { error: error.message || 'The score could not be disputed. Confirm that the round is open and try again.' };
  }
}
