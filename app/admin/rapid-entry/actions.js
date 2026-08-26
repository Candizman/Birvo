'use server'

import db from '../../../lib/database';
import { revalidatePath } from 'next/cache';
import { saveScoresBatch } from '../../../lib/services/scoreService';
import { requireAdminRole, SCORING_OPERATION_ROLES } from '../../../lib/auth';
import { getCourseSetupProgress } from '../../../lib/services/courseSetupService';
import dataBackend from '../../../lib/data/backend';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { normalizeEntityId } = entityId;

export async function saveScores(prevState, formData) {
  try {
    const context = await requireAdminRole(SCORING_OPERATION_ROLES);
    const activeDataBackend = resolveDataBackend();

    const { leagueId, currentWeek: weekNumber } = context;
    if (activeDataBackend === DATA_BACKENDS.SQLITE) {
      const readiness = getCourseSetupProgress(db, context.courseId, leagueId);
      if (!readiness.readyForScoring) throw new Error(`Scoring is not ready: ${readiness.blockers.map(item => item.label).join(', ')}.`);
    }
    const rawData = Object.fromEntries(formData);

    const scoresData = [];
    for (const [key, value] of Object.entries(rawData)) {
      if (key.startsWith('score_') && value && String(value).trim() !== '') {
        const numValue = Number(value);
        if (!Number.isInteger(numValue) || numValue < 1 || numValue > 200) {
          throw new Error(`Invalid score: "${value}". Please enter an integer between 1 and 200.`);
        }
        const rawTeamId = key.slice('score_'.length);
        const teamId = activeDataBackend === DATA_BACKENDS.SUPABASE
          ? normalizeEntityId(rawTeamId)
          : Number(rawTeamId);
        if (!teamId || (activeDataBackend === DATA_BACKENDS.SQLITE && (!Number.isInteger(teamId) || teamId < 1))) {
          throw new Error(`Invalid team ID.`);
        }
        scoresData.push({
          teamId,
          grossScore: numValue
        });
      }
    }

    if (scoresData.length === 0) return { success: true };

    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await operationsRepository.saveScoreBatch(await createClient(), {
        courseId: context.courseId, leagueId, weekNumber, scores: scoresData,
      });
    } else {
      saveScoresBatch(db, leagueId, weekNumber, scoresData, { actorUserId: context.user.id });
    }
    revalidatePath('/admin/rapid-entry');
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
