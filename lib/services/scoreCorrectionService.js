const { randomUUID } = require('node:crypto');
const { calculateNewHandicap } = require('../domain/handicap');
const { writeAuditEvent } = require('./auditService');

function requestScoreCorrection(db, { courseId, scoreId, requestedGrossScore, reason, actorUserId }) {
  const gross = Number(requestedGrossScore);
  const cleanReason = String(reason || '').trim();
  if (!Number.isInteger(gross) || gross < 1 || gross > 200) throw new Error('Corrected gross score must be an integer between 1 and 200.');
  if (cleanReason.length < 5 || cleanReason.length > 1000) throw new Error('Provide a correction reason between 5 and 1,000 characters.');
  const score = db.prepare(`
    SELECT s.id, s.gross_score, m.locked_at, l.course_id
    FROM scores s JOIN matches m ON m.id=s.match_id JOIN leagues l ON l.id=m.league_id
    WHERE s.id=?
  `).get(scoreId);
  if (!score || score.course_id !== courseId) throw new Error('Score not found for this course.');
  if (!score.locked_at) throw new Error('Unlocked scores can be corrected through normal score entry.');
  const id = randomUUID();
  return db.transaction(() => {
    const pending = db.prepare("SELECT id FROM score_correction_requests WHERE score_id=? AND status='pending'").get(scoreId);
    if (pending) throw new Error('A correction request is already pending for this score.');
    db.prepare(`INSERT INTO score_correction_requests (id,course_id,score_id,requested_by_user_id,requested_gross_score,reason) VALUES (?,?,?,?,?,?)`)
      .run(id, courseId, scoreId, actorUserId, gross, cleanReason);
    writeAuditEvent(db, { courseId, actorUserId, action: 'score.correction.requested', targetType: 'score', targetId: scoreId, metadata: { requestId: id, oldGross: score.gross_score, requestedGross: gross, reason: cleanReason } });
    return { id };
  })();
}

function reviewScoreCorrection(db, { courseId, requestId, decision, reviewNote, actorUserId }) {
  if (!['approved','rejected'].includes(decision)) throw new Error('Choose approve or reject.');
  const note = String(reviewNote || '').trim().slice(0, 1000);
  return db.transaction(() => {
    const request = db.prepare(`
      SELECT r.*, s.gross_score AS old_gross, s.handicap_used, s.team_id, s.match_id
      FROM score_correction_requests r JOIN scores s ON s.id=r.score_id
      WHERE r.id=? AND r.course_id=? AND r.status='pending'
    `).get(requestId, courseId);
    if (!request) throw new Error('Pending correction request not found.');

    if (decision === 'approved') {
      const netScore = Number((request.requested_gross_score - Number(request.handicap_used || 0)).toFixed(1));
      db.prepare("UPDATE scores SET gross_score=?, net_score=?, reconciliation_status='ok', updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(request.requested_gross_score, netScore, request.score_id);
      db.prepare(`INSERT INTO score_audit_logs (score_id,old_gross,new_gross,reason,modified_by) VALUES (?,?,?,?,?)`)
        .run(request.score_id, request.old_gross, request.requested_gross_score, `Approved locked-round correction: ${request.reason}`, actorUserId);
      const grossHistory = db.prepare(`
        SELECT s.gross_score FROM scores s JOIN matches m ON m.id=s.match_id
        WHERE s.team_id=? AND s.reconciliation_status!='needs_review' ORDER BY m.week_number ASC
      `).all(request.team_id).map(row => row.gross_score);
      db.prepare('UPDATE teams SET current_handicap=? WHERE id=?').run(calculateNewHandicap(grossHistory), request.team_id);
    }
    db.prepare(`UPDATE score_correction_requests SET status=?,reviewed_by_user_id=?,review_note=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(decision, actorUserId, note || null, requestId);
    writeAuditEvent(db, { courseId, actorUserId, action: `score.correction.${decision}`, targetType: 'score', targetId: request.score_id, metadata: { requestId, oldGross: request.old_gross, requestedGross: request.requested_gross_score, reviewNote: note } });
    return { decision };
  })();
}

module.exports = { requestScoreCorrection, reviewScoreCorrection };
