'use server'

import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';
import { createClient } from '../../../lib/supabase/server';
import operationsService from '../../../lib/services/operationsService';
import { FORMATS } from '../../../lib/domain/leagueFormats';

// Derived from the format definitions so that a format the scoring layer does
// not know about cannot be saved against a league.
const ALLOWED_FORMATS = new Set(Object.keys(FORMATS));

export async function createLeague(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const courseId = context.courseId;
  const leagueName = String(formData.get('leagueName') || '').trim();
  const gameFormat = String(formData.get('gameFormat') || 'stroke_play');
  const seasonLengthWeeks = Number(formData.get('seasonLengthWeeks'));
  
  if (leagueName.length < 2 || leagueName.length > 100) return { error: 'League name must be between 2 and 100 characters.' };
  if (!ALLOWED_FORMATS.has(gameFormat)) return { error: 'Invalid scoring format.' };
  if (!Number.isInteger(seasonLengthWeeks) || seasonLengthWeeks < 1 || seasonLengthWeeks > 52) return { error: 'Season length must be between 1 and 52 weeks.' };

  await operationsService.createLeague(await createClient(), courseId, leagueName, gameFormat, seasonLengthWeeks);

  revalidatePath('/admin');
  revalidatePath('/admin/leagues');
  return { success: true };
}

export async function updateLeagueFormat(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const leagueId = formData.get('leagueId');
  const gameFormat = String(formData.get('gameFormat') || '');
  if (!ALLOWED_FORMATS.has(gameFormat)) return { error: 'Invalid scoring format.' };
  
  await operationsService.updateLeagueFormat(await createClient(), context.courseId, leagueId, gameFormat);

  revalidatePath('/admin/leagues');
  revalidatePath('/admin');
  return { success: true };
}

export async function generatePlayoffAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const leagueId = formData.get('leagueId');
  const bracketSize = Number(formData.get('bracketSize')) || 4;
  if (![4, 8, 16].includes(bracketSize)) return { error: 'Invalid playoff bracket size.' };

  const result = await operationsService.generateLeaguePlayoffBracket(await createClient(), context.courseId, leagueId, bracketSize);
  if (result.error) return result;

  revalidatePath('/admin/leagues');
  return { success: true };
}

export async function setHandicapMethod(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const leagueId = formData.get('leagueId');
  const method = String(formData.get('handicapMethod') || '');
  const allowancePercent = Number(formData.get('allowancePercent'));
  if (!['league_average', 'best_of', 'whs'].includes(method)) return { error: 'Invalid handicap method.' };
  if (!Number.isInteger(allowancePercent) || allowancePercent < 50 || allowancePercent > 100) {
    return { error: 'Handicap allowance must be between 50 and 100 percent.' };
  }

  try {
    await operationsService.setLeagueHandicapMethod(await createClient(), {
      courseId: context.courseId, leagueId, method, allowancePercent,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to change the handicap method.' };
  }

  revalidatePath('/admin/leagues');
  revalidatePath('/admin/handicaps');
  revalidatePath('/admin');
  return { success: true };
}
