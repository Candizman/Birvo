'use server'
import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';

import { createAdminClient } from '../../../lib/supabase/admin';

export async function restoreLeague(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const leagueId = formData.get('leagueId'); // Use raw ID for service layer
  const courseId = context.courseId;

  const adminClient = createAdminClient();
  const { restoreLeagueAsync } = require('../../../lib/services/trashService');

  await restoreLeagueAsync(db, adminClient, leagueId, courseId);

  revalidatePath('/admin/trash');
  revalidatePath('/admin/leagues');
  return { success: true };
}
