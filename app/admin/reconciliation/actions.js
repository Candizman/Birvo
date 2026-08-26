'use server'
import db from '../../../lib/database';
import { revalidatePath } from 'next/cache';
import { calculateNewHandicap } from '../../../lib/domain/handicap';
import { requireAdminRole, SCORING_OPERATION_ROLES } from '../../../lib/auth';

import { createAdminClient } from '../../../lib/supabase/admin';
const { resolveScoreAsync, deleteScoreAsync } = require('../../../lib/services/reconciliationService');

export async function resolveScore(formData) {
  const context = await requireAdminRole(SCORING_OPERATION_ROLES);

  const scoreId = formData.get('scoreId');
  const handicapUsed = Number(formData.get('handicap'));
  const grossScore = Number(formData.get('gross'));

  if (!scoreId || isNaN(handicapUsed) || isNaN(grossScore) || grossScore < 1 || grossScore > 200) {
    throw new Error('Missing or invalid parameters.');
  }

  const adminClient = createAdminClient();
  await resolveScoreAsync(db, adminClient, { 
    scoreId, 
    courseId: context.courseId, 
    actorUserId: context.user.id, 
    handicapUsed, 
    grossScore 
  });

  revalidatePath('/admin/reconciliation');
  revalidatePath('/admin');
  return { success: true };
}

export async function deleteScore(formData) {
  const context = await requireAdminRole(SCORING_OPERATION_ROLES);

  const scoreId = formData.get('scoreId');

  if (!scoreId) {
    throw new Error('Missing score ID parameter.');
  }

  const adminClient = createAdminClient();
  await deleteScoreAsync(db, adminClient, { 
    scoreId, 
    courseId: context.courseId, 
    actorUserId: context.user.id 
  });

  revalidatePath('/admin/reconciliation');
  revalidatePath('/admin');
  return { success: true };
}
