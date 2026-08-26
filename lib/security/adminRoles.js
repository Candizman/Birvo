const COURSE_MANAGEMENT_ROLES = Object.freeze([
  'superadmin',
  'course_owner',
  'course_admin',
  'admin',
]);

const SCORING_OPERATION_ROLES = Object.freeze([
  ...COURSE_MANAGEMENT_ROLES,
  'assistant_admin',
  'scorekeeper',
]);

function hasAdminRole(role, allowedRoles) {
  return Boolean(role) && Array.isArray(allowedRoles) && allowedRoles.includes(role);
}

module.exports = {
  COURSE_MANAGEMENT_ROLES,
  SCORING_OPERATION_ROLES,
  hasAdminRole,
};
