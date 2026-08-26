'use server'

import db from '../../../lib/database';
import {
  requireAdminRole,
  COURSE_MANAGEMENT_ROLES,
  SCORING_OPERATION_ROLES,
} from '../../../lib/auth';
import {
  addLeagueSubstitute,
  generateRoundRobinMatchups,
  generateAndSaveFixtures,
  normalizeRSVPStatus,
  saveLeagueTeamRSVP,
} from '../../../lib/services/fixtureService';
import { revalidatePath } from 'next/cache';
import dataBackend from '../../../lib/data/backend';
import leagueRepository from '../../../lib/data/supabase/leagueRepository';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { normalizeEntityId } = entityId;

function persistenceId(value, activeDataBackend) {
  return activeDataBackend === DATA_BACKENDS.SUPABASE ? normalizeEntityId(value) : Number(value);
}

export async function generateFixturesAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  if (!context.leagueId) throw new Error('No active league is available.');

  const totalWeeks = Number(formData.get('totalWeeks'));
  const doubleRound = formData.get('doubleRound') === 'on';
  if (!Number.isInteger(totalWeeks) || totalWeeks < 2 || totalWeeks > 52) return { error: 'Season length must be between 2 and 52 weeks.' };

  const activeDataBackend = resolveDataBackend();
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    const client = await createClient();
    const teams = await leagueRepository.listActiveLeagueTeams(client, {
      courseId: context.courseId, leagueId: context.leagueId,
    });
    if (teams.length < 2) return { error: 'At least two active teams are required to generate a schedule.' };
    const fixtures = generateRoundRobinMatchups(teams, totalWeeks, doubleRound);
    await operationsRepository.replaceLeagueFixtures(client, {
      courseId: context.courseId,
      leagueId: context.leagueId,
      totalWeeks,
      doubleRound,
      fixtures,
    });
  } else {
    generateAndSaveFixtures(db, context.leagueId, totalWeeks, doubleRound, {
      courseId: context.courseId,
      actorUserId: context.user.id,
    });
  }

  revalidatePath('/admin/fixtures');
  return { success: true };
}

export async function addSubstituteAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  if (!context.leagueId) throw new Error('No active league is available.');

  const name = String(formData.get('name') || '').trim();
  const handicap = Number(formData.get('handicap'));
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (name.length < 2 || name.length > 120) return { error: 'Substitute name must be between 2 and 120 characters.' };
  if (!Number.isFinite(handicap) || handicap < -10 || handicap > 54) return { error: 'Handicap Index must be between -10.0 and 54.0.' };
  if (phone.length > 40) return { error: 'Phone number is too long.' };
  if (email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { error: 'Enter a valid email address.' };

  const activeDataBackend = resolveDataBackend();
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    await operationsRepository.addLeagueSubstitute(await createClient(), {
      courseId: context.courseId, leagueId: context.leagueId, name, handicap, phone, email,
    });
  } else {
    addLeagueSubstitute(db, {
      courseId: context.courseId,
      leagueId: context.leagueId,
      actorUserId: context.user.id,
      data: { name, handicap, phone, email },
    });
  }

  revalidatePath('/admin/fixtures');
  return { success: true };
}

export async function updateRSVPAction(previousState, formData) {
  try {
    const context = await requireAdminRole(SCORING_OPERATION_ROLES);

    if (!context.leagueId) throw new Error('No active league is available.');
    const activeDataBackend = resolveDataBackend();
    const teamId = persistenceId(formData.get('teamId'), activeDataBackend);
    const weekNumber = context.currentWeek;
    const status = normalizeRSVPStatus(String(formData.get('status') || ''));
    const note = String(formData.get('note') || '').trim();
    if (!teamId) return { error: 'Select a team.' };
    if (!['attending', 'not_attending', 'maybe', 'needs_sub', 'unknown'].includes(status)) return { error: 'Invalid RSVP status.' };
    if (note.length > 500) return { error: 'RSVP note cannot exceed 500 characters.' };

    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      await operationsRepository.saveTeamRsvp(await createClient(), {
        courseId: context.courseId, leagueId: context.leagueId, teamId, weekNumber, status, note,
      });
    } else {
      saveLeagueTeamRSVP(db, {
        courseId: context.courseId,
        leagueId: context.leagueId,
        teamId,
        weekNumber,
        status,
        note,
        actorUserId: context.user.id,
      });
    }

    revalidatePath('/admin/fixtures');
    return { success: `Week ${weekNumber} RSVP saved.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to save the RSVP.' };
  }
}

export async function applyGhostAction(formData) {
  try {
    const context = await requireAdminRole(SCORING_OPERATION_ROLES);
    if (!context.leagueId) throw new Error('No active league is available.');
    const activeDataBackend = resolveDataBackend();
    const teamId = persistenceId(formData.get('teamId'), activeDataBackend);
    if (!teamId) return { error: 'Select a valid team.' };
    let result;
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      result = await operationsRepository.applyGhostScore(await createClient(), {
        courseId: context.courseId,
        leagueId: context.leagueId,
        teamId,
        weekNumber: context.currentWeek,
      });
    } else {
      const { applyGhostPenalty } = require('../../../lib/services/ghostManagementService');
      result = applyGhostPenalty(db, {
        courseId: context.courseId,
        leagueId: context.leagueId,
        teamId,
        weekNumber: context.currentWeek,
        actorUserId: context.user.id,
      });
    }
    revalidatePath('/admin/fixtures');
    revalidatePath('/standings');
    return { success: true, ...result };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to apply the ghost score.' };
  }
}
