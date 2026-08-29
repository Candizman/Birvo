'use server'
import { revalidatePath } from 'next/cache';
import { getPlayerSession } from '../../lib/auth';
import { createAdminClient } from '../../lib/supabase/admin';

export async function submitPlayerScore(formData) {
  const session = await getPlayerSession();
  if (!session?.teamId) return { error: 'Unauthorized' };

  const teamId = session.teamId;
  const grossScore = Number(formData.get('grossScore'));
  if (!Number.isInteger(grossScore) || grossScore < 1 || grossScore > 200) {
    return { error: 'Gross score must be a whole number between 1 and 200.' };
  }

  try {
    const adminClient = createAdminClient();
    const { submitPlayerGrossScore } = require('../../lib/services/scoreService');
    await submitPlayerGrossScore(adminClient, teamId, grossScore);
    revalidatePath('/player');
    return { success: true };
  } catch (error) {
    return { error: error.message || 'The score could not be submitted. Confirm that this round is open and try again.' };
  }
}
