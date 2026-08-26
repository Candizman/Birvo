'use server'
import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';
import { lockRoundAndAdvance, postponeLeagueWeek } from '../../../lib/services/roundLifecycleService';
import { rotatePublicLink } from '../../../lib/services/publicLinkService';
import dataBackend from '../../../lib/data/backend';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { normalizeEntityId } = entityId;

function selectedLeagueId(formData, activeDataBackend) {
  const rawLeagueId = formData.get('leagueId');
  return activeDataBackend === DATA_BACKENDS.SUPABASE
    ? normalizeEntityId(rawLeagueId)
    : Number(rawLeagueId);
}

export async function cancelWeek(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const activeDataBackend = resolveDataBackend();
    const leagueId = selectedLeagueId(formData, activeDataBackend);
    const currentWeek = context.currentWeek;
    if (!leagueId || !context.allLeagues.some(league => String(league.id) === String(leagueId))) throw new Error('Unauthorized operation');
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      const nextWeek = await operationsRepository.postponeLeagueWeek(await createClient(), {
        courseId: context.courseId, leagueId, weekNumber: currentWeek,
      });
      revalidatePath('/admin/settings');
      revalidatePath('/admin');
      revalidatePath('/admin/fixtures');
      return { success: `Week ${currentWeek} was postponed. Week ${nextWeek} is now active and future schedule dates were shifted.` };
    }

    const { nextWeek } = postponeLeagueWeek(db, {
      courseId: context.courseId,
      leagueId,
      weekNumber: currentWeek,
      actorUserId: context.user.id,
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
    const activeDataBackend = resolveDataBackend();

    const leagueId = selectedLeagueId(formData, activeDataBackend);
    if (!leagueId || !context.allLeagues.some(league => String(league.id) === String(leagueId))) throw new Error('Unauthorized operation');
    const nextWeek = activeDataBackend === DATA_BACKENDS.SUPABASE
      ? await operationsRepository.lockRoundAndAdvance(await createClient(), {
          courseId: context.courseId, leagueId, weekNumber: context.currentWeek,
        })
      : lockRoundAndAdvance(db, {
          courseId: context.courseId, leagueId, weekNumber: context.currentWeek, actorUserId: context.user.id,
        }).nextWeek;

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
    const activeDataBackend = resolveDataBackend();
    const leagueId = selectedLeagueId(formData, activeDataBackend);
    const purpose = String(formData.get('purpose') || '');
    if (!leagueId || !context.allLeagues.some(league => String(league.id) === String(leagueId))) throw new Error('Unauthorized operation');
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await operationsRepository.rotatePublicLink(await createClient(), {
        courseId: context.courseId, leagueId, purpose,
      });
    } else {
      rotatePublicLink(db, { courseId: context.courseId, leagueId, purpose, actorUserId: context.user.id });
    }
    revalidatePath('/admin/settings');
    revalidatePath('/admin', 'layout');
    return { success: `${purpose.charAt(0).toUpperCase() + purpose.slice(1)} links rotated. Previously shared links no longer work.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to rotate the public link.' };
  }
}
