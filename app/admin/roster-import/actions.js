'use server'

import { revalidatePath } from 'next/cache';
import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import rosterImportService from '../../../lib/services/rosterImportService';

import { createAdminClient } from '../../../lib/supabase/admin';

export async function previewRosterAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const leagueId = formData.get('leagueId');
    const file = formData.get('rosterFile');
    if (!file || typeof file.arrayBuffer !== 'function' || !file.name) return { error: 'Choose a valid file.' };
    
    const nameLower = file.name.toLowerCase();
    if (!nameLower.endsWith('.csv') && !nameLower.endsWith('.xlsx')) {
      return { error: 'Roster uploads must use .csv or .xlsx format.' };
    }
    
    if (file.size > 1024 * 1024) return { error: 'Files must be smaller than 1 MB.' };
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const adminClient = createAdminClient();
    
    const preview = await rosterImportService.previewRosterImportAsync(db, adminClient, {
      courseId: context.courseId, 
      leagueId, 
      uploadedByUserId: context.user.id, 
      sourceName: file.name, 
      fileBuffer
    });
    return { preview };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to preview the roster.' };
  }
}

export async function commitRosterAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const adminClient = createAdminClient();
    
    const result = await rosterImportService.commitRosterImportAsync(db, adminClient, {
      importId: String(formData.get('importId') || ''), 
      courseId: context.courseId, 
      actorUserId: context.user.id,
    });
    
    revalidatePath('/admin');
    revalidatePath('/admin/handicaps');
    revalidatePath('/admin/roster-import');
    return { success: `${result.importedRows} team(s) imported.`, credentials: result.credentials };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to commit the roster.' };
  }
}
