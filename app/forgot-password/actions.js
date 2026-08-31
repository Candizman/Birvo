'use server'

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import persistentRateLimit from '../../lib/data/persistentRateLimit';

export async function requestPasswordReset(formData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email || !email.includes('@')) redirect('/forgot-password?error=invalid');
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/forgot-password?error=config');
  }
  const requestHeaders = await headers();
  const source = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || 'unknown';
  const adminClient = createAdminClient();
  if (!adminClient) redirect('/forgot-password?error=config');
  let allowed = { allowed: false };
  try {
    allowed = await persistentRateLimit.checkDataRateLimit({
      adminClient,
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
