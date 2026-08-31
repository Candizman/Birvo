'use server'

import { getPlayerSession } from '../../../lib/auth';
import entityIds from '../../../lib/security/entityId';
import { createAdminClient } from '../../../lib/supabase/admin';
import liveScoringService from '../../../lib/services/liveScoringService';
import { revalidatePath } from 'next/cache';

const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { submitLiveRound: submitLiveRoundToDb, attestOwnScore, disputeScore } = liveScoringService;

function parseEntityId(value) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  return UUID_PATTERN.test(normalized) ? normalized : null;
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

  const matchId = parseEntityId(formData.get('matchId'));
  const weekNumber = Number(formData.get('weekNumber'));
  const photoUrl = formData.get('photoUrl')?.trim() || null;
  const holes = readHoleDetails(formData);
  if (!matchId || !Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 52 || !holes) {
    return { error: 'Enter a valid score for every published hole.' };
  }

  try {
    const result = await submitLiveRoundToDb(createAdminClient(), session, matchId, weekNumber, holes, photoUrl);
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
  const scoreId = parseEntityId(formData.get('scoreId'));
  const pin = formData.get('pin')?.trim();
  if (!scoreId || !/^\d{4}$/.test(pin || '')) return { error: 'Enter the assigned opponent’s four-digit PIN.' };

  try {
    await attestOwnScore(createAdminClient(), session, scoreId, pin);
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
  try {
    const scoreId = parseEntityId(formData.get('scoreId'));
    const reason = formData.get('reason')?.trim();
    await disputeScore(createAdminClient(), session, scoreId, reason);
    revalidatePath('/player');
    revalidatePath('/admin/reconciliation');
    return { success: true };
  } catch (error) {
    return { error: error.message || 'The score could not be disputed. Confirm that the round is open and try again.' };
  }
}
