'use server'

import { revalidatePath } from 'next/cache';
import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import rosterImportService from '../../../lib/services/rosterImportService';

export async function previewRosterAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const leagueId = Number(formData.get('leagueId'));
    const file = formData.get('rosterFile');
    if (!file || typeof file.arrayBuffer !== 'function' || !file.name) return { error: 'Choose a CSV file.' };
    if (!file.name.toLowerCase().endsWith('.csv')) return { error: 'Roster uploads must use the .csv format.' };
    if (file.size > 1024 * 1024) return { error: 'CSV files must be smaller than 1 MB.' };
    const csvText = Buffer.from(await file.arrayBuffer()).toString('utf8');
    const preview = rosterImportService.previewRosterImport(db, {
      courseId: context.courseId, leagueId, uploadedByUserId: context.user.id, sourceName: file.name, csvText,
    });
    return { preview };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to preview the roster.' };
  }
}

export async function commitRosterAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const result = rosterImportService.commitRosterImport(db, {
      importId: String(formData.get('importId') || ''), courseId: context.courseId, actorUserId: context.user.id,
    });
    revalidatePath('/admin');
    revalidatePath('/admin/handicaps');
    revalidatePath('/admin/roster-import');
    return { success: `${result.importedRows} team(s) imported.`, credentials: result.credentials };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to commit the roster.' };
  }
}
