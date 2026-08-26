'use server'

import { revalidatePath } from 'next/cache';
import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES, SCORING_OPERATION_ROLES } from '../../../lib/auth';
import correctionService from '../../../lib/services/scoreCorrectionService';
import dataBackend from '../../../lib/data/backend';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { normalizeEntityId } = entityId;

function persistenceId(value, activeDataBackend) {
  return activeDataBackend === DATA_BACKENDS.SUPABASE ? normalizeEntityId(value) : Number(value);
}

export async function requestCorrectionAction(previousState, formData) {
  try {
    const context = await requireAdminRole(SCORING_OPERATION_ROLES);
    const activeDataBackend = resolveDataBackend();
    const input = {
      courseId: context.courseId, scoreId: persistenceId(formData.get('scoreId'), activeDataBackend),
      requestedGrossScore: Number(formData.get('requestedGrossScore')), reason: formData.get('reason'),
    };
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await operationsRepository.requestScoreCorrection(await createClient(), input);
    } else {
      correctionService.requestScoreCorrection(db, { ...input, actorUserId: context.user.id });
    }
    revalidatePath('/admin/corrections');
    return { success: 'Correction request submitted for committee review.' };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to request the correction.' }; }
}

export async function reviewCorrectionAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const activeDataBackend = resolveDataBackend();
    const decision = formData.get('decision');
    const input = {
      courseId: context.courseId, requestId: persistenceId(formData.get('requestId'), activeDataBackend), decision,
      reviewNote: formData.get('reviewNote'),
    };
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await operationsRepository.reviewScoreCorrection(await createClient(), input);
    } else {
      correctionService.reviewScoreCorrection(db, { ...input, actorUserId: context.user.id });
    }
    revalidatePath('/admin/corrections'); revalidatePath('/admin'); revalidatePath('/standings');
    return { success: `Correction ${decision}.` };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to review the correction.' }; }
}
