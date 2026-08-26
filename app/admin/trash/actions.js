'use server'
import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';

export async function restoreLeague(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const leagueId = parseInt(formData.get('leagueId'));
  const courseId = context.courseId;

  const restore = db.prepare("UPDATE leagues SET status = 'active' WHERE id = ? AND course_id = ? AND status = 'trashed'");
  restore.run(leagueId, courseId);

  revalidatePath('/admin/trash');
  return { success: true };
}
