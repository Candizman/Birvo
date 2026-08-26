import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

const ALLOWED_DESTINATIONS = new Set(['/account/update-password', '/admin']);

export async function GET(request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const code = url.searchParams.get('code');
  const requestedNext = url.searchParams.get('next');
  const destination = ALLOWED_DESTINATIONS.has(requestedNext) ? requestedNext : '/admin';
  const supabase = await createClient();
  let error = null;

  if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    error = new Error('Missing authentication code.');
  }

  if (error) return NextResponse.redirect(new URL('/login?error=link', url.origin));
  return NextResponse.redirect(new URL(destination, url.origin));
}
