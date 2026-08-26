'use server'

import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { revalidatePath } from 'next/cache';

export async function adjustHandicapManually(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const teamId = Number(formData.get('teamId'));
  const newHandicap = parseFloat(formData.get('newHandicap'));
  const reason = formData.get('reason')?.trim() || 'Committee Revision';
  const ghin = formData.get('ghin')?.trim();

  if (isNaN(newHandicap) || newHandicap < 0 || newHandicap > 54) {
    return { error: 'Handicap Index must be between 0.0 and 54.0.' };
  }

  const team = db.prepare(`
    SELECT t.id, t.current_handicap, l.course_id
    FROM teams t
    JOIN leagues l ON t.league_id = l.id
    WHERE t.id = ?
  `).get(teamId);

  if (!team || team.course_id !== context.courseId) {
    throw new Error("Unauthorized or team not found.");
  }

  db.transaction(() => {
    // 1. Record an audit log entry.
    db.prepare(`
      INSERT INTO handicap_audit_logs (team_id, old_handicap, new_handicap, change_type, reason, modified_by)
      VALUES (?, ?, ?, 'referee_manual', ?, ?)
    `).run(teamId, team.current_handicap, newHandicap, reason, context.user?.email || 'admin');

    // 2. Update the team.
    db.prepare(`
      UPDATE teams SET
        current_handicap = ?,
        ghin_number = COALESCE(?, ghin_number)
      WHERE id = ?
    `).run(newHandicap, ghin || null, teamId);
  })();

  revalidatePath('/admin/handicaps');
  revalidatePath('/admin');
  return { success: true };
}
