'use server'

import { revalidatePath } from 'next/cache';
import { requireAdminRole, SCORING_OPERATION_ROLES } from '../../../lib/auth';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { normalizeEntityId } = entityId;

export async function saveScores(prevState, formData) {
  try {
    const context = await requireAdminRole(SCORING_OPERATION_ROLES);
    const { leagueId, currentWeek: weekNumber } = context;

    // Scoring readiness (complete hole layout, a rated tee box, at least two
    // active teams, and an unlocked round) is enforced inside save_score_batch.
    const rawData = Object.fromEntries(formData);

    // hole_<teamId>_<holeNumber> fields, gathered per team. A team is only sent
    // as a hole-by-hole card when every hole is filled in; a half-typed card is
    // an error rather than a silent fallback to the total, because the difference
    // decides whether the round can be scored in its own format at all.
    const holesByTeam = new Map();
    const expectedHoleCount = Number(formData.get('holeCount')) || 0;
    for (const [key, value] of Object.entries(rawData)) {
      if (!key.startsWith('hole_')) continue;
      const [, rawTeamId, rawHoleNumber] = key.split('_');
      const teamId = normalizeEntityId(rawTeamId);
      const holeNumber = Number(rawHoleNumber);
      if (!teamId || !Number.isInteger(holeNumber)) throw new Error('Invalid hole score field.');
      if (String(value).trim() === '') continue;
      const holeScore = Number(value);
      if (!Number.isInteger(holeScore) || holeScore < 1 || holeScore > 20) {
        throw new Error(`Invalid hole score: "${value}". Enter a whole number between 1 and 20.`);
      }
      if (!holesByTeam.has(teamId)) holesByTeam.set(teamId, []);
      holesByTeam.get(teamId).push({ holeNumber, grossScore: holeScore });
    }

    const scoresData = [];
    const seenTeams = new Set();
    for (const [key, value] of Object.entries(rawData)) {
      if (!key.startsWith('score_')) continue;
      const teamId = normalizeEntityId(key.slice('score_'.length));
      if (!teamId) throw new Error('Invalid team ID.');

      const holes = holesByTeam.get(teamId) || [];
      const hasTotal = value && String(value).trim() !== '';
      if (holes.length === 0 && !hasTotal) continue;

      if (holes.length > 0 && holes.length !== expectedHoleCount) {
        throw new Error(
          `A hole-by-hole card must cover all ${expectedHoleCount} holes. `
          + `One card has ${holes.length}. Fill in the rest, or clear them and enter a total instead.`
        );
      }

      const entry = { teamId };
      if (hasTotal) {
        const numValue = Number(value);
        if (!Number.isInteger(numValue) || numValue < 1 || numValue > 200) {
          throw new Error(`Invalid score: "${value}". Please enter an integer between 1 and 200.`);
        }
        // Sent alongside the holes on purpose: the database refuses the batch if
        // the total written on the paper card disagrees with the holes typed in,
        // which catches a transcription slip while the card is still to hand.
        entry.grossScore = numValue;
      }
      if (holes.length > 0) entry.holes = holes.sort((a, b) => a.holeNumber - b.holeNumber);
      scoresData.push(entry);
      seenTeams.add(teamId);
    }

    // A hole grid filled in for a team with no matching total field at all.
    for (const [teamId, holes] of holesByTeam) {
      if (seenTeams.has(teamId)) continue;
      if (holes.length !== expectedHoleCount) {
        throw new Error(`A hole-by-hole card must cover all ${expectedHoleCount} holes.`);
      }
      scoresData.push({ teamId, holes: holes.sort((a, b) => a.holeNumber - b.holeNumber) });
    }

    if (scoresData.length === 0) return { success: true };

    await operationsRepository.saveScoreBatch(await createClient(), {
      courseId: context.courseId, leagueId, weekNumber, scores: scoresData,
    });
    revalidatePath('/admin/rapid-entry');
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
