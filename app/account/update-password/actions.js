'use server'

import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import persistentRateLimit from '../../../lib/data/persistentRateLimit';
import workspaceRepository from '../../../lib/data/supabase/workspaceRepository';

export async function updatePassword(previousState, formData) {
  const password = String(formData.get('password') || '');
  const confirmation = String(formData.get('confirmation') || '');
  if (password.length < 12) return { error: 'Use at least 12 characters.' };
  if (password !== confirmation) return { error: 'The password confirmation does not match.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?error=link');

  const adminClient = createAdminClient();
  if (!adminClient) {
    return { error: 'Password security services are not configured.' };
  }
  let allowed;
  try {
    allowed = await persistentRateLimit.checkDataRateLimit({
      adminClient,
      scope: 'password_update', subject: user.id, maxRequests: 5, windowMs: 60 * 60 * 1000,
    });
  } catch {
    return { error: 'Password security checks are temporarily unavailable. Try again.' };
  }
  if (!allowed.allowed) return { error: `Too many attempts. Try again in ${allowed.retryAfterSeconds} seconds.` };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'The password could not be updated. Request a new recovery link and try again.' };

  try {
    await workspaceRepository.acceptPendingInvitations(supabase);
  } catch {
    return { error: 'Your password was updated, but course access could not be activated. Sign in and try again.' };
  }
  redirect('/admin');
}
