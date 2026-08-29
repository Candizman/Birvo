'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAdminContext } from '../../lib/auth';
import onboardingService from '../../lib/services/onboardingService';
import workspaceRepository from '../../lib/data/supabase/workspaceRepository';
import { createClient } from '../../lib/supabase/server';

const { OnboardingError, validateOnboardingInput } = onboardingService;

export async function completeOnboarding(_previousState, formData) {
  const context = await getAdminContext();
  if (!context?.user) return { error: 'Your session expired. Sign in again to continue.' };
  if (context.courseId) return { error: 'This account already belongs to a course workspace.' };

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
    await workspaceRepository.createTenantWorkspace(await createClient(), input);
  } catch (error) {
    if (error instanceof OnboardingError) return { error: error.message };
    console.error('Tenant onboarding failed:', error);
    return { error: 'We could not create the workspace. No changes were saved. Try again.' };
  }

  revalidatePath('/admin', 'layout');
  redirect('/admin?onboarded=1');
}
