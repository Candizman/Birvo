'use server'

import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { generatePlayoffBracket } from '../../../lib/domain/tournamentFormats';
import { getLeagueStandings } from '../../../lib/services/standingsService';
import { revalidatePath } from 'next/cache';
import dataBackend from '../../../lib/data/backend';
import leagueRepository from '../../../lib/data/supabase/leagueRepository';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { normalizeEntityId } = entityId;
const ALLOWED_FORMATS = new Set(['stroke_play', 'match_play', 'stableford', 'scramble', 'skins', 'nassau']);

function persistenceId(value, activeDataBackend) {
  return activeDataBackend === DATA_BACKENDS.SUPABASE ? normalizeEntityId(value) : Number(value);
}

export async function createLeague(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const courseId = context.courseId;
  const leagueName = String(formData.get('leagueName') || '').trim();
  const gameFormat = String(formData.get('gameFormat') || 'stroke_play');
  const seasonLengthWeeks = Number(formData.get('seasonLengthWeeks'));
  if (leagueName.length < 2 || leagueName.length > 100) return { error: 'League name must be between 2 and 100 characters.' };
  if (!ALLOWED_FORMATS.has(gameFormat)) return { error: 'Invalid scoring format.' };
  if (!Number.isInteger(seasonLengthWeeks) || seasonLengthWeeks < 1 || seasonLengthWeeks > 52) return { error: 'Season length must be between 1 and 52 weeks.' };

  const activeDataBackend = resolveDataBackend();
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    await operationsRepository.createLeague(await createClient(), {
      courseId, name: leagueName, gameFormat, seasonLengthWeeks,
    });
  } else {
    db.prepare(`
      INSERT INTO leagues (course_id, name, status, current_week, game_format, season_length_weeks)
      VALUES (?, ?, 'active', 1, ?, ?)
    `).run(courseId, leagueName, gameFormat, seasonLengthWeeks);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/leagues');
  return { success: true };
}

export async function updateLeagueFormat(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const activeDataBackend = resolveDataBackend();
  const leagueId = persistenceId(formData.get('leagueId'), activeDataBackend);
  const gameFormat = String(formData.get('gameFormat') || '');
  if (!ALLOWED_FORMATS.has(gameFormat)) return { error: 'Invalid scoring format.' };
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    await operationsRepository.updateLeagueFormat(await createClient(), {
      courseId: context.courseId, leagueId, gameFormat,
    });
  } else {
    const league = db.prepare('SELECT course_id FROM leagues WHERE id = ?').get(leagueId);
    if (!league || league.course_id !== context.courseId) throw new Error('Unauthorized operation');
    const scoreCount = db.prepare('SELECT COUNT(*) AS count FROM scores s JOIN matches m ON m.id=s.match_id WHERE m.league_id=?').get(leagueId).count;
    if (scoreCount > 0) throw new Error('The scoring format cannot change after score entry begins.');
    db.prepare('UPDATE leagues SET game_format = ? WHERE id = ?').run(gameFormat, leagueId);
  }

  revalidatePath('/admin/leagues');
  revalidatePath('/admin');
  return { success: true };
}

export async function generatePlayoffAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const activeDataBackend = resolveDataBackend();
  const leagueId = persistenceId(formData.get('leagueId'), activeDataBackend);
  const bracketSize = Number(formData.get('bracketSize')) || 4;
  if (![4, 8, 16].includes(bracketSize)) return { error: 'Invalid playoff bracket size.' };

  const supabase = activeDataBackend === DATA_BACKENDS.SUPABASE ? await createClient() : null;
  let standingsData;
  if (supabase) {
    standingsData = await leagueRepository.getLeagueStandingsData(supabase, {
      courseId: context.courseId, leagueId,
    });
  } else {
    const league = db.prepare('SELECT course_id FROM leagues WHERE id = ?').get(leagueId);
    if (!league || league.course_id !== context.courseId) throw new Error('Unauthorized operation');
    standingsData = getLeagueStandings(db, leagueId);
  }
  if (!standingsData || standingsData.seasonStandings.length < 2) return { error: 'At least two ranked teams are required to generate a playoff bracket.' };

  const bracket = generatePlayoffBracket(standingsData.seasonStandings, bracketSize);
  if (supabase) {
    await operationsRepository.saveLeaguePlayoffBracket(supabase, {
      courseId: context.courseId, leagueId, bracket,
    });
  } else {
    db.prepare('UPDATE leagues SET playoff_bracket = ? WHERE id = ?').run(JSON.stringify(bracket), leagueId);
  }

  revalidatePath('/admin/leagues');
  return { success: true };
}
