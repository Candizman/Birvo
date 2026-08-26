'use server'

import { redirect } from 'next/navigation';
import db from '../../../lib/database';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import membershipService from '../../../lib/services/membershipService';
import dataBackend from '../../../lib/data/backend';
import persistentRateLimit from '../../../lib/data/persistentRateLimit';
import workspaceRepository from '../../../lib/data/supabase/workspaceRepository';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export async function updatePassword(previousState, formData) {
  const password = String(formData.get('password') || '');
  const confirmation = String(formData.get('confirmation') || '');
  if (password.length < 12) return { error: 'Use at least 12 characters.' };
  if (password !== confirmation) return { error: 'The password confirmation does not match.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?error=link');
  const activeDataBackend = resolveDataBackend();
  const adminClient = activeDataBackend === DATA_BACKENDS.SUPABASE ? createAdminClient() : null;
  if (activeDataBackend === DATA_BACKENDS.SUPABASE && !adminClient) {
    return { error: 'Password security services are not configured.' };
  }
  let allowed;
  try {
    allowed = await persistentRateLimit.checkDataRateLimit({
      backend: activeDataBackend, sqliteDb: db, adminClient,
      scope: 'password_update', subject: user.id, maxRequests: 5, windowMs: 60 * 60 * 1000,
    });
  } catch {
    return { error: 'Password security checks are temporarily unavailable. Try again.' };
  }
  if (!allowed.allowed) return { error: `Too many attempts. Try again in ${allowed.retryAfterSeconds} seconds.` };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'The password could not be updated. Request a new recovery link and try again.' };
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    try {
      await workspaceRepository.acceptPendingInvitations(supabase);
    } catch {
      return { error: 'Your password was updated, but course access could not be activated. Sign in and try again.' };
    }
  } else if (user.email) {
    membershipService.acceptPendingInvitations(db, { userId: user.id, email: user.email });
  }
  redirect('/admin');
}
