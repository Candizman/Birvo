'use server';

import { revalidatePath } from 'next/cache';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityIds from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { normalizeEntityId } = entityIds;

function refreshPublishingPages(leagueId) {
  revalidatePath('/admin/publishing');
  revalidatePath(`/tv/${leagueId}`);
}

export async function saveDisplayAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    if (!context.leagueId) throw new Error('No active league is available.');
    const autoScrollSpeed = Number(formData.get('autoScrollSpeed'));
    const announcementText = String(formData.get('announcementText') || '').trim();
    if (!Number.isInteger(autoScrollSpeed) || autoScrollSpeed < 3 || autoScrollSpeed > 120) {
      return { error: 'Rotation time must be between 3 and 120 seconds.' };
    }
    if (announcementText.length > 500) return { error: 'Announcement cannot exceed 500 characters.' };

    await operationsRepository.saveTVDisplaySettings(await createClient(), {
      courseId: context.courseId,
      leagueId: context.leagueId,
      actorUserId: context.user.id,
      templateType: 'leaderboard_ticker',
      autoScrollSpeed,
      showAnnouncements: formData.get('showAnnouncements') === 'on',
      announcementText,
      celebrationEffects: formData.get('celebrationEffects') === 'on',
      soundEnabled: formData.get('soundEnabled') === 'on',
    });
    refreshPublishingPages(context.leagueId);
    return { success: 'Clubhouse display settings saved.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to save display settings.' };
  }
}

export async function addSponsorAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    if (!context.leagueId) throw new Error('No active league is available.');
    const name = String(formData.get('name') || '').trim();
    const logoUrl = String(formData.get('logoUrl') || '').trim();
    const displayOrder = Number(formData.get('displayOrder'));
    if (name.length < 2 || name.length > 100) return { error: 'Partner name must be between 2 and 100 characters.' };
    if (logoUrl && (logoUrl.length > 2048 || !/^(https:\/\/|\/)/i.test(logoUrl))) {
      return { error: 'Logo URL must use HTTPS or a site-relative path.' };
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 1000) return { error: 'Display order must be between 0 and 1000.' };

    await operationsRepository.addTVSponsor(await createClient(), {
      courseId: context.courseId,
      leagueId: context.leagueId,
      actorUserId: context.user.id,
      name,
      logoUrl,
      displayOrder,
    });
    refreshPublishingPages(context.leagueId);
    return { success: `${name} added to the partner rotation.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to add the partner.' };
  }
}

export async function deleteSponsorAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    if (!context.leagueId) throw new Error('No active league is available.');
    const sponsorId = normalizeEntityId(formData.get('sponsorId'));
    if (!sponsorId) return { error: 'Invalid partner selection.' };

    await operationsRepository.deleteTVSponsor(await createClient(), {
      courseId: context.courseId,
      leagueId: context.leagueId,
      actorUserId: context.user.id,
      sponsorId,
    });
    refreshPublishingPages(context.leagueId);
    return { success: 'Partner removed.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to remove the partner.' };
  }
}
