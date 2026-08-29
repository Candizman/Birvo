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

    const scoresData = [];
    for (const [key, value] of Object.entries(rawData)) {
      if (key.startsWith('score_') && value && String(value).trim() !== '') {
        const numValue = Number(value);
        if (!Number.isInteger(numValue) || numValue < 1 || numValue > 200) {
          throw new Error(`Invalid score: "${value}". Please enter an integer between 1 and 200.`);
        }
        const teamId = normalizeEntityId(key.slice('score_'.length));
        if (!teamId) {
          throw new Error('Invalid team ID.');
        }
        scoresData.push({
          teamId,
          grossScore: numValue
        });
      }
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
