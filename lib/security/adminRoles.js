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

// Closing or permanently removing a workspace. Narrower than course management on
// purpose: an admin runs the league, but only the owner ends it. The database
// enforces the same restriction independently.
const COURSE_LIFECYCLE_ROLES = Object.freeze([
  'superadmin',
  'course_owner',
]);

function hasAdminRole(role, allowedRoles) {
  return Boolean(role) && Array.isArray(allowedRoles) && allowedRoles.includes(role);
}

module.exports = {
  COURSE_MANAGEMENT_ROLES,
  COURSE_LIFECYCLE_ROLES,
  SCORING_OPERATION_ROLES,
  hasAdminRole,
};
