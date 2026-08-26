'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase/server'
import { createAdminClient } from '../../lib/supabase/admin'
import db from '../../lib/database'
import membershipService from '../../lib/services/membershipService'
import dataBackend from '../../lib/data/backend'
import persistentRateLimit from '../../lib/data/persistentRateLimit'
import workspaceRepository from '../../lib/data/supabase/workspaceRepository'
import { headers } from 'next/headers'

const { DATA_BACKENDS, resolveDataBackend } = dataBackend

export async function login(formData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '')

  if (!email || !password) redirect('/login?error=credentials')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    redirect('/login?error=config')
  }
  const activeDataBackend = resolveDataBackend()

  const requestHeaders = await headers()
  const source = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || 'unknown'
  const adminClient = activeDataBackend === DATA_BACKENDS.SUPABASE ? createAdminClient() : null
  if (activeDataBackend === DATA_BACKENDS.SUPABASE && !adminClient) redirect('/login?error=config')
  let allowed
  try {
    allowed = await persistentRateLimit.checkDataRateLimit({
      backend: activeDataBackend, sqliteDb: db, adminClient,
      scope: 'admin_login', subject: `${source}:${email}`, maxRequests: 8, windowMs: 15 * 60 * 1000,
    })
  } catch {
    redirect('/login?error=unavailable')
  }
  if (!allowed.allowed) redirect('/login?error=credentials')

  const supabase = await createClient()

  const data = {
    email,
    password,
  }

  const { data: authData, error } = await supabase.auth.signInWithPassword(data)

  if (error) {
    redirect('/login?error=credentials')
  }

  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    try {
      await workspaceRepository.acceptPendingInvitations(supabase)
    } catch {
      redirect('/login?error=unavailable')
    }
  } else if (authData.user?.email) {
    membershipService.acceptPendingInvitations(db, {
      userId: authData.user.id,
      email: authData.user.email,
    })
  }

  revalidatePath('/admin', 'layout')
  let hasMembership = false
  if (authData.user) {
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      try {
        hasMembership = (await workspaceRepository.listUserMemberships(supabase, authData.user.id)).length > 0
      } catch {
        redirect('/login?error=unavailable')
      }
    } else {
      hasMembership = Boolean(db.prepare("SELECT course_id FROM course_memberships WHERE user_id = ? AND status = 'active' ORDER BY created_at ASC LIMIT 1").get(authData.user.id))
    }
  }
  redirect(hasMembership ? '/admin' : '/onboarding')
}
