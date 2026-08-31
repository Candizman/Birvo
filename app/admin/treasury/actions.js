'use server'

import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';
import operationsService from '../../../lib/services/operationsService';

const DUES_METHODS = new Set(['cash', 'check', 'other']);
const DUES_STATUSES = new Set(['unpaid', 'paid', 'waived']);

function dollarsToCents(value) {
  const dollars = Number(value);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

export async function setTreasurySettings(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const leagueId = formData.get('leagueId');
  const duesAmountCents = dollarsToCents(formData.get('duesAmount'));
  const skinsEntryFeeCents = dollarsToCents(formData.get('skinsEntryFee'));
  if (duesAmountCents === null || skinsEntryFeeCents === null) {
    return { error: 'Enter a dues amount and skins entry fee of $0 or more.' };
  }

  try {
    await operationsService.setLeagueTreasurySettings(await createClient(), {
      courseId: context.courseId, leagueId, duesAmountCents, skinsEntryFeeCents,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to save treasury settings.' };
  }

  revalidatePath('/admin/treasury');
  return { success: true };
}

export async function setTeamDues(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const teamId = formData.get('teamId');
  const status = String(formData.get('status') || '');
  const method = String(formData.get('method') || '');
  const note = String(formData.get('note') || '').slice(0, 200);
  if (!DUES_STATUSES.has(status)) return { error: 'Invalid dues status.' };
  if (status === 'paid' && !DUES_METHODS.has(method)) return { error: 'Choose how the team paid.' };

  try {
    await operationsService.setTeamDuesStatus(await createClient(), {
      courseId: context.courseId, teamId, status, method: DUES_METHODS.has(method) ? method : null, note,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update dues status.' };
  }

  revalidatePath('/admin/treasury');
  return { success: true };
}
