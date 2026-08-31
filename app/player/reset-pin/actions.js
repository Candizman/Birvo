'use server'

import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';
import entityIds from '../../../lib/security/entityId';
import { hashTeamPin } from '../../../lib/security/pin';

const { normalizeEntityId } = entityIds;

export async function executeTeamPinReset(formData) {
  const teamId = normalizeEntityId(formData.get('teamId'));
  const token = formData.get('token');

  if (!teamId || !token) {
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

  // Returning to the league sign-in page would need that league's public access
  // token, which a reset link does not carry. Send the player to the landing page
  // instead; their original invitation link takes them back to the roster.
  redirect('/?message=pin_reset_success');
}
