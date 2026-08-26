const { writeAuditEvent } = require('./auditService');

function buildRoundCloseReadiness({ match = null, activeTeams = 0, scores = [] }) {
  const entered = scores.length;
  const unattested = scores.filter(score => !['attested', 'approved'].includes(score.attestation_status)).length;
  const needsReview = scores.filter(score => score.reconciliation_status === 'needs_review').length;
  const blockers = [];
  if (!match) blockers.push('The round has not been scheduled.');
  if (activeTeams < 1) blockers.push('The league has no active teams.');
  if (entered !== activeTeams) blockers.push(`${Math.max(0, activeTeams - entered)} scorecard(s) are missing.`);
  if (unattested > 0) blockers.push(`${unattested} scorecard(s) still need attestation.`);
  if (needsReview > 0) blockers.push(`${needsReview} scorecard(s) require reconciliation.`);
  if (match?.locked_at) blockers.push('This round is already locked.');
  return { match, activeTeams, entered, unattested, needsReview, canLock: blockers.length === 0, blockers };
}

function getRoundCloseReadiness(db, leagueId, weekNumber) {
  const match = db.prepare('SELECT id, status, locked_at FROM matches WHERE league_id = ? AND week_number = ?').get(leagueId, weekNumber);
  const activeTeams = db.prepare("SELECT COUNT(*) AS count FROM teams WHERE league_id = ? AND status = 'active'").get(leagueId).count;
  const scores = match
    ? db.prepare('SELECT attestation_status, reconciliation_status FROM scores WHERE match_id = ?').all(match.id)
    : [];
  return buildRoundCloseReadiness({ match, activeTeams: Number(activeTeams || 0), scores });
}

function lockRoundAndAdvance(db, { courseId, leagueId, weekNumber, actorUserId }) {
  return db.transaction(() => {
    const league = db.prepare('SELECT id, current_week FROM leagues WHERE id = ? AND course_id = ?').get(leagueId, courseId);
    if (!league || league.current_week !== weekNumber) throw new Error('The selected round is no longer current. Refresh and try again.');
    const readiness = getRoundCloseReadiness(db, leagueId, weekNumber);
    if (!readiness.canLock) throw new Error(readiness.blockers.join(' '));
    db.prepare(`
      UPDATE matches SET status = 'locked', locked_at = CURRENT_TIMESTAMP, locked_by_user_id = ?, lock_reason = 'Round finalized by course management'
      WHERE id = ? AND locked_at IS NULL
    `).run(actorUserId, readiness.match.id);
    db.prepare('UPDATE leagues SET current_week = current_week + 1 WHERE id = ? AND course_id = ? AND current_week = ?').run(leagueId, courseId, weekNumber);
    writeAuditEvent(db, { courseId, actorUserId, action: 'round.locked_and_advanced', targetType: 'match', targetId: readiness.match.id, metadata: { leagueId, weekNumber, scorecards: readiness.entered } });
    return { nextWeek: weekNumber + 1 };
  })();
}

function postponeLeagueWeek(db, { courseId, leagueId, weekNumber, actorUserId }) {
  return db.transaction(() => {
    const league = db.prepare(`
      SELECT id, current_week, season_length_weeks
      FROM leagues
      WHERE id = ? AND course_id = ? AND status = 'active'
    `).get(leagueId, courseId);
    if (!league || league.current_week !== weekNumber) {
      throw new Error('The selected round is no longer current. Refresh and try again.');
    }
    if (weekNumber >= 52 || Number(league.season_length_weeks || 0) >= 52) {
      throw new Error('The schedule cannot extend beyond Week 52.');
    }

    const match = db.prepare(`
      SELECT id, status, locked_at
      FROM matches
      WHERE league_id = ? AND week_number = ?
    `).get(leagueId, weekNumber);
    if (match?.locked_at || match?.status === 'locked') {
      throw new Error('A locked round cannot be postponed. Use the correction workflow.');
    }
    if (match?.status === 'rained_out') {
      throw new Error('This round has already been marked as rained out.');
    }

    const futureMatches = db.prepare(`
      SELECT id
      FROM matches
      WHERE league_id = ? AND week_number > ?
      ORDER BY week_number DESC, id DESC
    `).all(leagueId, weekNumber);
    const shiftMatch = db.prepare('UPDATE matches SET week_number = week_number + 1 WHERE id = ?');
    futureMatches.forEach(item => shiftMatch.run(item.id));

    let rainoutMatchId = match?.id;
    if (rainoutMatchId) {
      db.prepare("UPDATE matches SET status = 'rained_out' WHERE id = ?").run(rainoutMatchId);
    } else {
      rainoutMatchId = Number(db.prepare(`
        INSERT INTO matches (league_id, week_number, status)
        VALUES (?, ?, 'rained_out')
      `).run(leagueId, weekNumber).lastInsertRowid);
    }

    db.prepare(`
      UPDATE match_fixtures
      SET week_number = week_number + 1,
          scheduled_date = CASE
            WHEN scheduled_date IS NULL THEN NULL
            ELSE date(scheduled_date, '+7 days')
          END
      WHERE league_id = ? AND week_number >= ?
    `).run(leagueId, weekNumber);
    db.prepare(`
      UPDATE tee_times
      SET week_number = week_number + 1
      WHERE league_id = ? AND week_number >= ?
    `).run(leagueId, weekNumber);

    const rsvps = db.prepare(`
      SELECT pr.id
      FROM player_rsvps pr
      JOIN teams t ON t.id = pr.team_id
      WHERE t.league_id = ? AND pr.week_number >= ?
      ORDER BY pr.week_number DESC, pr.id DESC
    `).all(leagueId, weekNumber);
    const shiftRsvp = db.prepare('UPDATE player_rsvps SET week_number = week_number + 1 WHERE id = ?');
    rsvps.forEach(item => shiftRsvp.run(item.id));

    const update = db.prepare(`
      UPDATE leagues
      SET current_week = ?, season_length_weeks = season_length_weeks + 1
      WHERE id = ? AND course_id = ? AND current_week = ?
    `).run(weekNumber + 1, leagueId, courseId, weekNumber);
    if (update.changes !== 1) throw new Error('The league changed while the rainout was being recorded. Refresh and try again.');

    writeAuditEvent(db, {
      courseId,
      actorUserId,
      action: 'round.rainout',
      targetType: 'match',
      targetId: rainoutMatchId,
      metadata: { leagueId, weekNumber, nextWeek: weekNumber + 1 },
    });
    return { nextWeek: weekNumber + 1, matchId: rainoutMatchId };
  })();
}

module.exports = {
  buildRoundCloseReadiness,
  getRoundCloseReadiness,
  lockRoundAndAdvance,
  postponeLeagueWeek,
};
