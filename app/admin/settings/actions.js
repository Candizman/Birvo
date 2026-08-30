'use server'
import { requireAdminRole, COURSE_MANAGEMENT_ROLES, COURSE_LIFECYCLE_ROLES } from '../../../lib/auth';
import trashRepository from '../../../lib/data/supabase/trashRepository';
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

// ─── Workspace lifecycle ─────────────────────────────────────────────────────
// Two steps on purpose. Closing is reversible and stops the clock; purging
// destroys the workspace and every score in it. The database enforces both the
// owner check and the closed-first rule independently of anything here.

export async function closeWorkspace(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_LIFECYCLE_ROLES);
    await trashRepository.closeCourse(await createClient(), context.courseId);
    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    return { success: true, message: 'Workspace closed. It can be reopened, or removed for good below.' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to close the workspace.' };
  }
}

export async function reopenWorkspace(previousState) {
  try {
    const context = await requireAdminRole(COURSE_LIFECYCLE_ROLES);
    await trashRepository.reopenCourse(await createClient(), context.courseId);
    revalidatePath('/admin/settings');
    revalidatePath('/admin');
    return { success: true, message: 'Workspace reopened.' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to reopen the workspace.' };
  }
}

export async function purgeWorkspace(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_LIFECYCLE_ROLES);

    // Typing the name is the last thing standing between a click and a deleted
    // season, so it is checked here rather than trusted to the browser.
    const typed = String(formData.get('confirmName') || '').trim();
    const expected = String(formData.get('courseName') || '').trim();
    if (!expected || typed !== expected) {
      return { success: false, error: `Type the course name exactly (${expected}) to confirm.` };
    }

    await trashRepository.purgeCourse(await createClient(), context.courseId);
    revalidatePath('/admin');
    return { success: true, message: 'Workspace permanently removed.' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to remove the workspace.' };
  }
}
