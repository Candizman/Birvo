'use server'

import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { archiveLeague } from '../../../lib/services/seasonEndService';
import { redirect } from 'next/navigation';

export async function archiveLeagueAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  const leagueId = context.leagueId;
  const userId = context.user.id;

  if (!leagueId) {
    throw new Error('No league selected');
  }

  archiveLeague(db, leagueId, userId);

  redirect('/admin');
}

export async function generateCertificateAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  return { success: true, message: 'Certificate generation is a draft feature.' };
}
