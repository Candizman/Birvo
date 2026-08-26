function writeAuditEvent(db, { courseId = null, actorUserId = null, action, targetType, targetId = null, metadata = {} }) {
  if (!action || !targetType) throw new Error('Audit action and target type are required.');
  return db.prepare(`
    INSERT INTO audit_events (course_id, actor_user_id, action, target_type, target_id, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(courseId, actorUserId, action, targetType, targetId == null ? null : String(targetId), JSON.stringify(metadata));
}

module.exports = { writeAuditEvent };
