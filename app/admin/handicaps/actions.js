'use server'

import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '../../../lib/supabase/admin';

export async function adjustHandicapManually(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const teamId = Number(formData.get('teamId'));
  const newHandicap = parseFloat(formData.get('newHandicap'));
  const reason = formData.get('reason')?.trim() || 'Committee Revision';
  const ghin = formData.get('ghin')?.trim();

  if (isNaN(newHandicap) || newHandicap < 0 || newHandicap > 54) {
    return { error: 'Handicap Index must be between 0.0 and 54.0.' };
  }

  const adminClient = createAdminClient();
  const { adjustHandicapManuallyAsync } = require('../../../lib/services/handicapService');

  await adjustHandicapManuallyAsync(db, adminClient, {
    teamId,
    courseId: context.courseId,
    actorEmail: context.user?.email || 'admin',
    newHandicap,
    ghin,
    reason
  });

  revalidatePath('/admin/handicaps');
  revalidatePath('/admin');
  return { success: true };
}
