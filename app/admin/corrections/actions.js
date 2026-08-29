'use server'

import { revalidatePath } from 'next/cache';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES, SCORING_OPERATION_ROLES } from '../../../lib/auth';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { normalizeEntityId } = entityId;

export async function requestCorrectionAction(previousState, formData) {
  try {
    const context = await requireAdminRole(SCORING_OPERATION_ROLES);
    await operationsRepository.requestScoreCorrection(await createClient(), {
      courseId: context.courseId,
      scoreId: normalizeEntityId(formData.get('scoreId')),
      requestedGrossScore: Number(formData.get('requestedGrossScore')),
      reason: formData.get('reason'),
    });
    revalidatePath('/admin/corrections');
    return { success: 'Correction request submitted for committee review.' };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to request the correction.' }; }
}

export async function reviewCorrectionAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const decision = formData.get('decision');
    await operationsRepository.reviewScoreCorrection(await createClient(), {
      courseId: context.courseId,
      requestId: normalizeEntityId(formData.get('requestId')),
      decision,
      reviewNote: formData.get('reviewNote'),
    });
    revalidatePath('/admin/corrections'); revalidatePath('/admin'); revalidatePath('/standings');
    return { success: `Correction ${decision}.` };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to review the correction.' }; }
}
