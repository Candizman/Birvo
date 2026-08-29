'use server'

import { redirect } from 'next/navigation';
import crypto from 'node:crypto';
import playerRepository from '../../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../../lib/supabase/admin';
import entityIds from '../../../../lib/security/entityId';

const { normalizeEntityId } = entityIds;

export async function requestTeamPinReset(formData) {
  const leagueId = formData.get('leagueId');
  const access = formData.get('access') || '';
  const teamId = normalizeEntityId(formData.get('teamId'));
  const email = String(formData.get('email') || '').trim().toLowerCase();

  if (!teamId || !email) {
    redirect(`/player/login/forgot-pin?leagueId=${leagueId}&access=${access}&error=invalid`);
  }

  const adminClient = createAdminClient();
  if (!adminClient) redirect(`/player/login/forgot-pin?leagueId=${leagueId}&access=${access}&error=config`);

  // Generate plain token and its hash
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const success = await playerRepository.requestPinReset(adminClient, {
    teamId,
    email,
    tokenHash,
  });

  if (success) {
    // In a real application, send this URL via an email provider (e.g. Resend, Sendgrid)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const resetUrl = `${baseUrl}/player/reset-pin?teamId=${teamId}&token=${rawToken}`;
    console.log(`\n\n[DEV ONLY] PIN RESET LINK FOR TEAM ${teamId}:\n${resetUrl}\n\n`);
  }

  // Always redirect to success to prevent email enumeration
  redirect(`/player/login/forgot-pin?leagueId=${leagueId}&access=${access}&sent=1`);
}
