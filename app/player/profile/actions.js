'use server'

import db from '../../../lib/database';
import { getPlayerSession } from '../../../lib/auth';
import {
  updatePlayerProfile as updateSqlitePlayerProfile,
  addClubToBag,
  deleteClubFromBag,
  saveRoundNote,
} from '../../../lib/services/playerService';
import dataBackend from '../../../lib/data/backend';
import entityIds from '../../../lib/security/entityId';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import { createAdminClient } from '../../../lib/supabase/admin';
import { revalidatePath } from 'next/cache';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { UUID_PATTERN, normalizeEntityId } = entityIds;
const {
  addPlayerBagClub,
  deletePlayerBagClub,
  savePlayerRoundNote,
  updatePlayerProfile,
} = operationsRepository;

function parseEntityId(value, backend) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  if (backend === DATA_BACKENDS.SUPABASE) return UUID_PATTERN.test(normalized) ? normalized : null;
  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

async function requirePlayerTeam() {
  const session = await getPlayerSession();
  return session?.teamId || null;
}

export async function saveProfileAction(formData) {
  const teamId = await requirePlayerTeam();
  if (!teamId) return { error: 'Authentication required.' };
  const bio = formData.get('bio')?.trim() || '';
  const favoriteClub = formData.get('favoriteClub')?.trim() || '';
  const handicapGoal = Number(formData.get('handicapGoal'));
  const themePreference = formData.get('themePreference') || 'system';
  if (bio.length > 2000 || favoriteClub.length > 120
    || !Number.isFinite(handicapGoal) || handicapGoal < -10 || handicapGoal > 54
    || !['system', 'light', 'dark'].includes(themePreference)) {
    return { error: 'Check the profile fields and try again.' };
  }

  const activeDataBackend = resolveDataBackend();
  try {
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await updatePlayerProfile(createAdminClient(), {
        teamId,
        bio,
        favoriteClub,
        handicapGoal,
        themePreference,
        language: 'en-US',
      });
    } else {
      updateSqlitePlayerProfile(db, teamId, {
        bio,
        favoriteClub,
        handicapGoal,
        themePreference,
        language: 'en-US',
      });
    }
    revalidatePath('/player/profile');
    revalidatePath('/player');
    return { success: true };
  } catch {
    return { error: 'The profile could not be saved. Try again.' };
  }
}

export async function addClubAction(formData) {
  const teamId = await requirePlayerTeam();
  if (!teamId) return { error: 'Authentication required.' };
  const clubName = formData.get('clubName')?.trim() || '';
  const brand = formData.get('brand')?.trim() || '';
  const avgDistanceYards = Number(formData.get('avgDistanceYards'));
  if (clubName.length < 2 || clubName.length > 80 || brand.length > 120
    || !Number.isInteger(avgDistanceYards) || avgDistanceYards < 0 || avgDistanceYards > 450) {
    return { error: 'Enter a valid club name and carry distance in yards.' };
  }

  const activeDataBackend = resolveDataBackend();
  try {
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await addPlayerBagClub(createAdminClient(), { teamId, clubName, brand, avgDistanceYards });
    } else {
      addClubToBag(db, teamId, { clubName, brand, avgDistanceYards });
    }
    revalidatePath('/player/profile');
    return { success: true };
  } catch {
    return { error: 'The club could not be added. Try again.' };
  }
}

export async function deleteClubAction(formData) {
  const teamId = await requirePlayerTeam();
  if (!teamId) return { error: 'Authentication required.' };
  const activeDataBackend = resolveDataBackend();
  const clubId = parseEntityId(formData.get('clubId'), activeDataBackend);
  if (!clubId) return { error: 'The selected club is invalid.' };
  try {
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await deletePlayerBagClub(createAdminClient(), { teamId, clubId });
    } else {
      deleteClubFromBag(db, teamId, clubId);
    }
    revalidatePath('/player/profile');
    return { success: true };
  } catch {
    return { error: 'The club could not be removed. Try again.' };
  }
}

export async function addRoundNoteAction(formData) {
  const teamId = await requirePlayerTeam();
  if (!teamId) return { error: 'Authentication required.' };
  const weekNumber = Number(formData.get('weekNumber'));
  const notes = formData.get('notes')?.trim() || '';
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 52
    || notes.length < 1 || notes.length > 5000) {
    return { error: 'Enter a valid week and note.' };
  }
  const activeDataBackend = resolveDataBackend();
  try {
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await savePlayerRoundNote(createAdminClient(), { teamId, weekNumber, notes });
    } else {
      saveRoundNote(db, teamId, weekNumber, notes);
    }
    revalidatePath('/player/profile');
    return { success: true };
  } catch {
    return { error: 'The round note could not be saved. Try again.' };
  }
}
