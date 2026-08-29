'use server'
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { normalizeEntityId } = entityId;

function selectedLeagueId(formData) {
  return normalizeEntityId(formData.get('leagueId'));
}

export async function cancelWeek(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const leagueId = selectedLeagueId(formData);
    const currentWeek = context.currentWeek;
    if (!leagueId || !context.allLeagues.some(league => String(league.id) === String(leagueId))) throw new Error('Unauthorized operation');

    const nextWeek = await operationsRepository.postponeLeagueWeek(await createClient(), {
      courseId: context.courseId, leagueId, weekNumber: currentWeek,
    });
    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    revalidatePath('/admin/fixtures');
    return { success: `Week ${currentWeek} was postponed. Week ${nextWeek} is now active and future schedule dates were shifted.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to postpone the round.' };
  }
}

export async function advanceWeek(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const leagueId = selectedLeagueId(formData);
    if (!leagueId || !context.allLeagues.some(league => String(league.id) === String(leagueId))) throw new Error('Unauthorized operation');

    const nextWeek = await operationsRepository.lockRoundAndAdvance(await createClient(), {
      courseId: context.courseId, leagueId, weekNumber: context.currentWeek,
    });

    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    return { success: `Week ${context.currentWeek} is locked. Week ${nextWeek} is now active.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to finalize the round.' };
  }
}

export async function rotatePublicLinkAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const leagueId = selectedLeagueId(formData);
    const purpose = String(formData.get('purpose') || '');
    if (!leagueId || !context.allLeagues.some(league => String(league.id) === String(leagueId))) throw new Error('Unauthorized operation');

    await operationsRepository.rotatePublicLink(await createClient(), {
      courseId: context.courseId, leagueId, purpose,
    });
    revalidatePath('/admin/settings');
    revalidatePath('/admin', 'layout');
    return { success: `${purpose.charAt(0).toUpperCase() + purpose.slice(1)} links rotated. Previously shared links no longer work.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to rotate the public link.' };
  }
}
