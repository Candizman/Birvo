'use server'

import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import dataBackend from '../../../lib/data/backend';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';
import entityIds from '../../../lib/security/entityId';
import { hashTeamPin } from '../../../lib/security/pin';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { normalizeEntityId } = entityIds;

export async function executeTeamPinReset(formData) {
  const activeDataBackend = resolveDataBackend();
  const teamId = normalizeEntityId(formData.get('teamId'));
  const token = formData.get('token');
  
  if (activeDataBackend !== DATA_BACKENDS.SUPABASE || !teamId || !token) {
    redirect('/?error=invalid_reset');
  }

  const newPin = formData.get('newPin')?.trim();
  if (!newPin || !/^\d{4}$/.test(newPin)) {
    redirect(`/player/reset-pin?teamId=${teamId}&token=${token}&error=invalid`);
  }

  const adminClient = createAdminClient();
  if (!adminClient) redirect('/?error=config');

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const newPinHash = hashTeamPin(newPin);

  const success = await playerRepository.executePinReset(adminClient, {
    teamId,
    tokenHash,
    newPinHash,
  });

  if (!success) {
    redirect(`/player/reset-pin?teamId=${teamId}&token=${token}&error=expired`);
  }

  // Redirect to success or login. We don't have the leagueId easily here, 
  // so we can redirect to the home page or a specific success route.
  // Actually, we can just fetch the league_id via adminClient.
  const { data: team } = await adminClient.from('teams').select('league_id').eq('id', teamId).maybeSingle();
  if (team?.league_id) {
    // We would need the public link access token but we don't have it.
    // So just redirect to the root which lets the player find their way back.
    redirect(`/?message=pin_reset_success`);
  }

  redirect('/?message=pin_reset_success');
}
