'use server'

import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { archiveLeague } from '../../../lib/services/seasonEndService';
import { createClient } from '../../../lib/supabase/server';
import { redirect } from 'next/navigation';

export async function archiveLeagueAction() {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  if (!context.leagueId) {
    throw new Error('No league selected');
  }

  await archiveLeague(await createClient(), {
    courseId: context.courseId,
    leagueId: context.leagueId,
  });

  redirect('/admin');
}

export async function generateCertificateAction() {
  await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  return { success: true, message: 'Certificate generation is a draft feature.' };
}
