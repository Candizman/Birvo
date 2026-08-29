'use server'
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';
import trashRepository from '../../../lib/data/supabase/trashRepository';
import { createAdminClient } from '../../../lib/supabase/admin';
import entityId from '../../../lib/security/entityId';

const { normalizeEntityId } = entityId;

export async function restoreLeague(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  const leagueId = normalizeEntityId(formData.get('leagueId'));
  if (!leagueId) return { error: 'Select a valid league.' };

  await trashRepository.restoreLeague(createAdminClient(), leagueId, context.courseId);

  revalidatePath('/admin/trash');
  revalidatePath('/admin/leagues');
  return { success: true };
}
