'use server'
import db from '../../../lib/database';
import { revalidatePath } from 'next/cache';
import { calculateNewHandicap } from '../../../lib/domain/handicap';
import { requireAdminRole, SCORING_OPERATION_ROLES } from '../../../lib/auth';

export async function resolveScore(formData) {
  const context = await requireAdminRole(SCORING_OPERATION_ROLES);

  const scoreId = Number(formData.get('scoreId'));
  const handicapUsed = Number(formData.get('handicap'));
  const grossScore = Number(formData.get('gross'));

  if (!scoreId || isNaN(handicapUsed) || isNaN(grossScore) || grossScore < 1 || grossScore > 200) {
    throw new Error('Missing or invalid parameters.');
  }

  // Tenant security validation
  const scoreRow = db.prepare(`
    SELECT s.team_id, s.match_id, m.league_id, m.locked_at, l.course_id
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    JOIN leagues l ON m.league_id = l.id
    WHERE s.id = ?
  `).get(scoreId);

  if (!scoreRow || scoreRow.course_id !== context.courseId) {
    throw new Error('Unauthorized operation or score record not found.');
  }
  if (scoreRow.locked_at) throw new Error('This round is locked. Use the score correction workflow.');

  const netScore = grossScore - handicapUsed;

  db.transaction(() => {
    // 1. Repair score record
    db.prepare(`
      UPDATE scores
      SET handicap_used = ?, net_score = ?, gross_score = ?, reconciliation_status = 'ok'
      WHERE id = ?
    `).run(handicapUsed, netScore, grossScore, scoreId);

    // 2. Recalculate team handicap
    const matchRow = db.prepare('SELECT week_number FROM matches WHERE id = ?').get(scoreRow.match_id);

    const allPastScores = db.prepare(`
      SELECT gross_score FROM scores
      JOIN matches ON scores.match_id = matches.id
      WHERE team_id = ? AND matches.week_number <= ? AND scores.reconciliation_status != 'needs_review'
    `).all(scoreRow.team_id, matchRow.week_number).map(row => row.gross_score);

    const newHandicap = calculateNewHandicap(allPastScores);
    db.prepare('UPDATE teams SET current_handicap = ? WHERE id = ?').run(newHandicap, scoreRow.team_id);
  })();

  revalidatePath('/admin/reconciliation');
  revalidatePath('/admin');
  return { success: true };
}

export async function deleteScore(formData) {
  const context = await requireAdminRole(SCORING_OPERATION_ROLES);

  const scoreId = Number(formData.get('scoreId'));

  if (!scoreId) {
    throw new Error('Missing score ID parameter.');
  }

  // Tenant security validation
  const scoreRow = db.prepare(`
    SELECT s.id, m.locked_at, l.course_id
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    JOIN leagues l ON m.league_id = l.id
    WHERE s.id = ?
  `).get(scoreId);

  if (!scoreRow || scoreRow.course_id !== context.courseId) {
    throw new Error('Unauthorized operation or score record not found.');
  }
  if (scoreRow.locked_at) throw new Error('A score from a locked round cannot be deleted. Use the score correction workflow.');

  db.prepare("DELETE FROM scores WHERE id = ? AND reconciliation_status = 'needs_review'").run(scoreId);

  revalidatePath('/admin/reconciliation');
  revalidatePath('/admin');
  return { success: true };
}
