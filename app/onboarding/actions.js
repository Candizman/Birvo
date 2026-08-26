'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import db from '../../lib/database';
import { getAdminContext } from '../../lib/auth';
import onboardingService from '../../lib/services/onboardingService';
import dataBackend from '../../lib/data/backend';
import workspaceRepository from '../../lib/data/supabase/workspaceRepository';
import { createClient } from '../../lib/supabase/server';

const { createTenantWorkspace, OnboardingError, validateOnboardingInput } = onboardingService;
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export async function completeOnboarding(_previousState, formData) {
  const context = await getAdminContext();
  if (!context?.user) return { error: 'Your session expired. Sign in again to continue.' };
  if (context.courseId) return { error: 'This account already belongs to a course workspace.' };

  const activeDataBackend = resolveDataBackend();
  if (activeDataBackend === DATA_BACKENDS.SQLITE && db.pragma('user_version', { simple: true }) < 14) {
    return { error: 'The workspace database must be upgraded before onboarding can continue.' };
  }

  try {
    const input = validateOnboardingInput({
      userId: context.user.id,
      email: context.user.email,
      courseName: formData.get('courseName'),
      address: formData.get('address'),
      city: formData.get('city'),
      state: formData.get('state'),
      postalCode: formData.get('postalCode'),
      timezone: formData.get('timezone'),
      leagueName: formData.get('leagueName'),
      gameFormat: formData.get('gameFormat'),
      seasonLengthWeeks: formData.get('seasonLengthWeeks'),
    });
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await workspaceRepository.createTenantWorkspace(await createClient(), input);
    } else {
      createTenantWorkspace(db, input);
    }
  } catch (error) {
    if (error instanceof OnboardingError) return { error: error.message };
    console.error('Tenant onboarding failed:', error);
    return { error: 'We could not create the workspace. No changes were saved. Try again.' };
  }

  revalidatePath('/admin', 'layout');
  redirect('/admin?onboarded=1');
}
