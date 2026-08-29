/**
 * Staff invitation input validation.
 *
 * Membership records themselves are written by the create_course_invitation,
 * update_course_member_role, remove_course_member and revoke_course_invitation
 * functions in PostgreSQL, which re-check the role and the caller's course
 * permissions. What remains here is the input validation the server action runs
 * first so the operator gets a clear message before a round trip.
 */

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

module.exports = {
  INVITABLE_ROLES,
  MANAGED_ROLES,
  normalizeEmail,
  validateInvitableRole,
};
