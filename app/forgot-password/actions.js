'use server'

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import db from '../../lib/database';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import dataBackend from '../../lib/data/backend';
import persistentRateLimit from '../../lib/data/persistentRateLimit';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export async function requestPasswordReset(formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@')) redirect('/forgot-password?error=invalid');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/forgot-password?error=config');
  }
  const activeDataBackend = resolveDataBackend();

  const requestHeaders = await headers();
  const source = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || 'unknown';
  const adminClient = activeDataBackend === DATA_BACKENDS.SUPABASE ? createAdminClient() : null;
  if (activeDataBackend === DATA_BACKENDS.SUPABASE && !adminClient) redirect('/forgot-password?error=config');
  let allowed = { allowed: false };
  try {
    allowed = await persistentRateLimit.checkDataRateLimit({
      backend: activeDataBackend, sqliteDb: db, adminClient,
      scope: 'password_reset', subject: `${source}:${email}`, maxRequests: 3, windowMs: 60 * 60 * 1000,
    });
  } catch {
    // Preserve the same response for provider failures and unknown accounts.
  }
  if (allowed.allowed) {
    const supabase = await createClient();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    // Deliberately ignore provider errors here to prevent account enumeration.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${baseUrl}/auth/confirm?next=/account/update-password`,
    });
  }
  redirect('/forgot-password?sent=1');
}
