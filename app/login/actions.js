'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { createAdminClient } from '../../lib/supabase/admin'
import persistentRateLimit from '../../lib/data/persistentRateLimit'
import workspaceRepository from '../../lib/data/supabase/workspaceRepository'
import { headers } from 'next/headers'

export async function login(formData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')

  if (!email || !password) redirect('/login?error=credentials')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/login?error=config')
  }

  const requestHeaders = await headers()
  const source = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || 'unknown'
  const adminClient = createAdminClient()
  if (!adminClient) redirect('/login?error=config')
  let allowed
  try {
    allowed = await persistentRateLimit.checkDataRateLimit({
      adminClient,
      scope: 'admin_login', subject: `${source}:${email}`, maxRequests: 8, windowMs: 15 * 60 * 1000,
    })
  } catch {
    redirect('/login?error=unavailable')
  }
  if (!allowed.allowed) redirect('/login?error=credentials')

  const supabase = await createClient()

  const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    redirect('/login?error=credentials')
  }

  try {
    await workspaceRepository.acceptPendingInvitations(supabase)
  } catch {
    redirect('/login?error=unavailable')
  }

  revalidatePath('/admin', 'layout')
  let hasMembership = false
  if (authData.user) {
    try {
      hasMembership = (await workspaceRepository.listUserMemberships(supabase, authData.user.id)).length > 0
    } catch {
      redirect('/login?error=unavailable')
    }
  }
  redirect(hasMembership ? '/admin' : '/onboarding')
}
