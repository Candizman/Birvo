'use server'

import db from '../../../lib/database';
import { getPlayerSession } from '../../../lib/auth';
import { submitHoleByHoleScore, attestScore, disputeScore } from '../../../lib/services/liveScoringService';
import { hashTeamPin, isHashedTeamPin, verifyTeamPin } from '../../../lib/security/pin';
import dataBackend from '../../../lib/data/backend';
import entityIds from '../../../lib/security/entityId';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import { createAdminClient } from '../../../lib/supabase/admin';
import { revalidatePath } from 'next/cache';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { getPlayerScoreOpponent } = playerRepository;
const {
  attestPlayerScore,
  submitPlayerHoleScorecard,
  upgradePlayerPinHash,
} = operationsRepository;

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

  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    try {
      const adminClient = createAdminClient();
      const result = await submitPlayerHoleScorecard(adminClient, {
        teamId: session.teamId,
        matchId,
        holes,
        photoUrl,
      });
      revalidatePath('/player');
      revalidatePath('/player/live-tracker');
      revalidatePath('/standings');
      return { success: true, ...result };
    } catch {
      return { error: 'The scorecard could not be saved. Confirm that the round is open and try again.' };
    }
  }

  const assignedMatch = db.prepare(`
    SELECT m.id
    FROM matches m
    JOIN teams t ON t.id = ? AND t.league_id = m.league_id
    JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
    WHERE m.id = ? AND m.week_number = ? AND (f.team1_id = t.id OR f.team2_id = t.id)
  `).get(session.teamId, matchId, weekNumber);
  if (!assignedMatch) return { error: 'This scorecard is not assigned to your team.' };

  try {
    const result = submitHoleByHoleScore(db, {
      matchId,
      teamId: session.teamId,
      weekNumber,
      holeDetails: holes.map(item => ({
        hole_number: item.holeNumber,
        gross_score: item.grossScore,
        putts: item.putts,
        fairway_hit: item.fairwayHit,
        sand_saves: item.sandSave,
        penalty_strokes: item.penaltyStrokes,
      })),
      photoUrl,
      modifiedBy: `player-${session.teamId}`,
    });
    revalidatePath('/player');
    revalidatePath('/player/live-tracker');
    revalidatePath('/standings');
    return { success: true, ...result };
  } catch {
    return { error: 'The scorecard could not be saved. Confirm that the round is open and try again.' };
  }
}

export async function attestOwnScoreAction(formData) {
  const session = await getPlayerSession();
  if (!session?.teamId) return { error: 'Authentication required.' };
  const activeDataBackend = resolveDataBackend();
  const scoreId = parseEntityId(formData.get('scoreId'), activeDataBackend);
  const pin = formData.get('pin')?.trim();
  if (!scoreId || !/^\d{4}$/.test(pin || '')) return { error: 'Enter the assigned opponent’s four-digit PIN.' };

  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    try {
      const adminClient = createAdminClient();
      const context = await getPlayerScoreOpponent(adminClient, { teamId: session.teamId, scoreId });
      if (!context || !verifyTeamPin(pin, context.opponent.pin)) {
        return { error: 'The opponent PIN could not be verified.' };
      }
      if (!isHashedTeamPin(context.opponent.pin)) {
        await upgradePlayerPinHash(adminClient, {
          teamId: context.opponent.id,
          pinHash: hashTeamPin(pin),
        });
      }
      await attestPlayerScore(adminClient, {
        teamId: session.teamId,
        scoreId,
        attestingTeamId: context.opponent.id,
      });
      revalidatePath('/player');
      revalidatePath('/player/live-tracker');
      revalidatePath('/standings');
      return { success: true };
    } catch {
      return { error: 'The scorecard could not be attested. Try again.' };
    }
  }

  const opponent = db.prepare(`
    SELECT opponent.id, opponent.pin
    FROM scores s
    JOIN matches m ON m.id = s.match_id
    JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
    JOIN teams opponent ON opponent.id = CASE WHEN f.team1_id = s.team_id THEN f.team2_id ELSE f.team1_id END
    WHERE s.id = ? AND s.team_id = ? AND (f.team1_id = s.team_id OR f.team2_id = s.team_id)
  `).get(scoreId, session.teamId);
  if (!opponent || !verifyTeamPin(pin, opponent.pin)) return { error: 'The opponent PIN could not be verified.' };
  const result = attestScore(db, scoreId, opponent.id, pin);
  if (result.error) return result;
  revalidatePath('/player');
  revalidatePath('/player/live-tracker');
  revalidatePath('/standings');
  return { success: true };
}

export async function disputeScoreAction(formData) {
  const session = await getPlayerSession();
  if (!session?.teamId) return { error: 'Authentication required.' };
  const activeDataBackend = resolveDataBackend();
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    try {
      const adminClient = createAdminClient();
      await playerRepository.disputeScore(adminClient, {
        scoreId: parseEntityId(formData.get('scoreId'), activeDataBackend),
        reason: formData.get('reason')?.trim()
      });
      revalidatePath('/player');
      revalidatePath('/admin/reconciliation');
      return { success: true };
    } catch {
      return { error: 'The score could not be disputed. Confirm that the round is open and try again.' };
    }
  }
  const scoreId = Number(formData.get('scoreId'));
  const reason = formData.get('reason')?.trim();
  const opponentScore = db.prepare(`
    SELECT s.id
    FROM scores s
    JOIN matches m ON m.id = s.match_id
    JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
    WHERE s.id = ? AND s.team_id != ?
      AND (f.team1_id = ? OR f.team2_id = ?)
      AND (f.team1_id = s.team_id OR f.team2_id = s.team_id)
  `).get(scoreId, session.teamId, session.teamId, session.teamId);
  if (!opponentScore) return { error: 'You cannot dispute this score.' };
  disputeScore(db, scoreId, reason);
  revalidatePath('/player');
  revalidatePath('/admin/reconciliation');
  return { success: true };
}
