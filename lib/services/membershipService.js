const { randomUUID } = require('node:crypto');
const { writeAuditEvent } = require('./auditService');

const INVITABLE_ROLES = Object.freeze(['course_admin', 'assistant_admin', 'scorekeeper']);
const MANAGED_ROLES = Object.freeze(['course_owner', ...INVITABLE_ROLES]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new Error('Enter a valid email address.');
  return email;
}

function validateInvitableRole(role) {
  const value = String(role || 'scorekeeper');
  if (!INVITABLE_ROLES.includes(value)) throw new Error('Select a valid staff role.');
  return value;
}

function createInvitation(db, { courseId, email, role, invitedByUserId, ttlDays = 7 }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedRole = validateInvitableRole(role);
  if (!courseId || !invitedByUserId) throw new Error('Course and inviter are required.');
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + Math.max(1, Math.min(30, ttlDays)) * 86400000).toISOString();

  return db.transaction(() => {
    const member = db.prepare(`
      SELECT id FROM course_memberships
      WHERE course_id = ? AND email = ? COLLATE NOCASE AND status = 'active'
    `).get(courseId, normalizedEmail);
    if (member) throw new Error('This email already has access to the course.');

    const pending = db.prepare(`
      SELECT id FROM course_invitations
      WHERE course_id = ? AND email = ? COLLATE NOCASE AND status = 'pending'
    `).get(courseId, normalizedEmail);
    if (pending) throw new Error('A pending invitation already exists for this email.');

    db.prepare(`
      INSERT INTO course_invitations (id, course_id, email, role, invited_by_user_id, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, courseId, normalizedEmail, normalizedRole, invitedByUserId, expiresAt);
    writeAuditEvent(db, {
      courseId, actorUserId: invitedByUserId, action: 'staff.invitation.created',
      targetType: 'course_invitation', targetId: id, metadata: { email: normalizedEmail, role: normalizedRole },
    });
    return { id, email: normalizedEmail, role: normalizedRole, expiresAt };
  })();
}

function markInvitationSent(db, invitationId, authUserId = null) {
  return db.prepare(`
    UPDATE course_invitations SET external_invitation_sent_at = CURRENT_TIMESTAMP,
      auth_user_id = COALESCE(?, auth_user_id), last_error = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).run(authUserId, invitationId);
}

function markInvitationFailed(db, invitationId, errorMessage) {
  return db.prepare(`
    UPDATE course_invitations SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).run(String(errorMessage || 'Invitation provider error').slice(0, 500), invitationId);
}

function acceptPendingInvitations(db, { userId, email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!userId) return [];

  return db.transaction(() => {
    db.prepare(`
      UPDATE course_invitations SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'pending' AND expires_at <= CURRENT_TIMESTAMP
    `).run();
    const invitations = db.prepare(`
      SELECT * FROM course_invitations
      WHERE email = ? COLLATE NOCASE AND status = 'pending' AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at ASC
    `).all(normalizedEmail);

    for (const invitation of invitations) {
      db.prepare(`
        INSERT INTO course_memberships (course_id, user_id, email, role, status)
        VALUES (?, ?, ?, ?, 'active')
        ON CONFLICT(course_id, user_id) DO UPDATE SET
          email = excluded.email, role = excluded.role, status = 'active', updated_at = CURRENT_TIMESTAMP
      `).run(invitation.course_id, userId, normalizedEmail, invitation.role);
      db.prepare(`
        UPDATE course_invitations SET status = 'accepted', auth_user_id = ?, accepted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP WHERE id = ?
      `).run(userId, invitation.id);
      writeAuditEvent(db, {
        courseId: invitation.course_id, actorUserId: userId, action: 'staff.invitation.accepted',
        targetType: 'course_invitation', targetId: invitation.id, metadata: { email: normalizedEmail, role: invitation.role },
      });
    }
    return invitations.map(invitation => invitation.course_id);
  })();
}

function listCourseAccess(db, courseId) {
  const tables = new Set(db.pragma('table_list').map(item => item.name));
  if (!tables.has('course_memberships')) {
    return tables.has('users') ? db.prepare(`
      SELECT id, email, role, 'active' AS status, created_at, 'member' AS access_type, id AS user_id
      FROM users WHERE course_id = ? ORDER BY email
    `).all(courseId) : [];
  }
  const members = db.prepare(`
    SELECT id, email, role, status, joined_at AS created_at, 'member' AS access_type, user_id
    FROM course_memberships WHERE course_id = ? AND status <> 'removed'
  `).all(courseId);
  const invitations = tables.has('course_invitations') ? db.prepare(`
    SELECT id, email, role, status, created_at, 'invitation' AS access_type, NULL AS user_id, expires_at, last_error
    FROM course_invitations WHERE course_id = ? AND status IN ('pending', 'failed')
  `).all(courseId) : [];
  return [...members, ...invitations].sort((a, b) => a.email.localeCompare(b.email));
}

function updateMemberRole(db, { courseId, membershipId, role, actorUserId }) {
  const normalizedRole = String(role || '');
  if (!MANAGED_ROLES.includes(normalizedRole)) throw new Error('Select a valid role.');
  return db.transaction(() => {
    const member = db.prepare('SELECT * FROM course_memberships WHERE id = ? AND course_id = ?').get(membershipId, courseId);
    if (!member || member.status === 'removed') throw new Error('Staff membership not found.');
    if (member.role === 'course_owner' && normalizedRole !== 'course_owner') {
      const owners = db.prepare("SELECT COUNT(*) AS count FROM course_memberships WHERE course_id = ? AND role = 'course_owner' AND status = 'active'").get(courseId).count;
      if (owners <= 1) throw new Error('Assign another active course owner before changing this owner.');
    }
    db.prepare('UPDATE course_memberships SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND course_id = ?').run(normalizedRole, membershipId, courseId);
    writeAuditEvent(db, { courseId, actorUserId, action: 'staff.role.updated', targetType: 'course_membership', targetId: membershipId, metadata: { from: member.role, to: normalizedRole } });
    return { success: true };
  })();
}

function removeMember(db, { courseId, membershipId, actorUserId }) {
  return db.transaction(() => {
    const member = db.prepare('SELECT * FROM course_memberships WHERE id = ? AND course_id = ?').get(membershipId, courseId);
    if (!member || member.status !== 'active') throw new Error('Active staff membership not found.');
    if (member.user_id === actorUserId) throw new Error('You cannot remove your own active access.');
    if (member.role === 'course_owner') {
      const owners = db.prepare("SELECT COUNT(*) AS count FROM course_memberships WHERE course_id = ? AND role = 'course_owner' AND status = 'active'").get(courseId).count;
      if (owners <= 1) throw new Error('The course must always have an active owner.');
    }
    db.prepare("UPDATE course_memberships SET status = 'removed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND course_id = ?").run(membershipId, courseId);
    writeAuditEvent(db, { courseId, actorUserId, action: 'staff.membership.removed', targetType: 'course_membership', targetId: membershipId, metadata: { email: member.email, role: member.role } });
    return { success: true };
  })();
}

function revokeInvitation(db, { courseId, invitationId, actorUserId }) {
  return db.transaction(() => {
    const invitation = db.prepare("SELECT * FROM course_invitations WHERE id = ? AND course_id = ? AND status = 'pending'").get(invitationId, courseId);
    if (!invitation) throw new Error('Pending invitation not found.');
    db.prepare("UPDATE course_invitations SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(invitationId);
    writeAuditEvent(db, { courseId, actorUserId, action: 'staff.invitation.revoked', targetType: 'course_invitation', targetId: invitationId, metadata: { email: invitation.email } });
    return { success: true };
  })();
}

module.exports = {
  INVITABLE_ROLES, normalizeEmail, validateInvitableRole, createInvitation, markInvitationSent, markInvitationFailed,
  acceptPendingInvitations, listCourseAccess, updateMemberRole, removeMember, revokeInvitation,
};
