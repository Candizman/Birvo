'use server'
import db from '../../lib/database';
import { saveScoresBatch } from '../../lib/services/scoreService';
import { revalidatePath } from 'next/cache';
import { getPlayerSession } from '../../lib/auth';
import dataBackend from '../../lib/data/backend';
import operationsRepository from '../../lib/data/supabase/operationsRepository';
import { createAdminClient } from '../../lib/supabase/admin';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { submitPlayerGrossScore } = operationsRepository;

export async function submitPlayerScore(formData) {
  const session = await getPlayerSession();
  if (!session?.teamId) return { error: 'Unauthorized' };

  const teamId = session.teamId;
  const grossScore = Number(formData.get('grossScore'));
  if (!Number.isInteger(grossScore) || grossScore < 1 || grossScore > 200) {
    return { error: 'Gross score must be a whole number between 1 and 200.' };
  }

  const activeDataBackend = resolveDataBackend();
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    try {
      const adminClient = createAdminClient();
      await submitPlayerGrossScore(adminClient, { teamId, grossScore });
      revalidatePath('/player');
      return { success: true };
    } catch {
      return { error: 'The score could not be submitted. Confirm that this round is open and try again.' };
    }
  }

  const team = db.prepare('SELECT league_id FROM teams WHERE id = ?').get(teamId);
  if (!team) return { error: 'Team not found' };

  const leagueId = team.league_id;
  const league = db.prepare("SELECT current_week FROM leagues WHERE id = ?").get(leagueId);
  const weekNumber = league ? league.current_week : 1;
  try {
    saveScoresBatch(db, leagueId, weekNumber, [{ teamId, grossScore }]);
    revalidatePath('/player');
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}
