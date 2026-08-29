'use server'
import { revalidatePath } from 'next/cache';
import { requireAdminRole, SCORING_OPERATION_ROLES } from '../../../lib/auth';
import { createAdminClient } from '../../../lib/supabase/admin';
import reconciliationRepository from '../../../lib/data/supabase/reconciliationRepository';
import entityId from '../../../lib/security/entityId';

const { normalizeEntityId } = entityId;

export async function resolveScore(formData) {
  const context = await requireAdminRole(SCORING_OPERATION_ROLES);

  const scoreId = normalizeEntityId(formData.get('scoreId'));
  const handicapUsed = Number(formData.get('handicap'));
  const grossScore = Number(formData.get('gross'));

  if (!scoreId || isNaN(handicapUsed) || isNaN(grossScore) || grossScore < 1 || grossScore > 200) {
    throw new Error('Missing or invalid parameters.');
  }

  await reconciliationRepository.resolveDisputedScore(createAdminClient(), {
    scoreId,
    courseId: context.courseId,
    actorUserId: context.user.id,
    handicapUsed,
    grossScore,
    netScore: grossScore - handicapUsed,
  });

  revalidatePath('/admin/reconciliation');
  revalidatePath('/admin');
  return { success: true };
}

export async function deleteScore(formData) {
  const context = await requireAdminRole(SCORING_OPERATION_ROLES);

  const scoreId = normalizeEntityId(formData.get('scoreId'));

  if (!scoreId) {
    throw new Error('Missing score ID parameter.');
  }

  await reconciliationRepository.deleteDisputedScore(createAdminClient(), {
    scoreId,
    courseId: context.courseId,
    actorUserId: context.user.id,
  });

  revalidatePath('/admin/reconciliation');
  revalidatePath('/admin');
  return { success: true };
}
