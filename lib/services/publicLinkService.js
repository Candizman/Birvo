const { writeAuditEvent } = require('./auditService');

const PURPOSES = new Set(['standings', 'tv', 'player']);

function rotatePublicLink(db, { courseId, leagueId, purpose, actorUserId }) {
  if (!PURPOSES.has(purpose)) throw new Error('Invalid public link purpose.');
  const league = db.prepare('SELECT id FROM leagues WHERE id = ? AND course_id = ?').get(leagueId, courseId);
  if (!league) throw new Error('League not found for this course.');
  return db.transaction(() => {
    db.prepare(`
      INSERT INTO public_link_settings (course_id, league_id, purpose, token_version, rotated_by_user_id, rotated_at)
      VALUES (?, ?, ?, 2, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(league_id, purpose) DO UPDATE SET
        token_version = public_link_settings.token_version + 1,
        rotated_by_user_id = excluded.rotated_by_user_id,
        rotated_at = CURRENT_TIMESTAMP
    `).run(courseId, leagueId, purpose, actorUserId);
    const version = db.prepare('SELECT token_version FROM public_link_settings WHERE league_id = ? AND purpose = ?').get(leagueId, purpose).token_version;
    writeAuditEvent(db, { courseId, actorUserId, action: 'public_link.rotated', targetType: 'league', targetId: leagueId, metadata: { purpose, version } });
    return { version };
  })();
}

module.exports = { rotatePublicLink };
