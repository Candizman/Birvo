/**
 * RSVP status vocabulary.
 *
 * Lives in the domain layer rather than in a service because both the repository
 * layer and the server actions normalize incoming values, and a service-level
 * home created a require cycle between fixtureService and leagueRepository.
 */

const RSVP_STATUSES = Object.freeze([
  'attending',
  'not_attending',
  'maybe',
  'needs_sub',
  'unknown',
]);

const RSVP_ALIASES = Object.freeze({
  yes: 'attending',
  confirmed: 'attending',
  no: 'not_attending',
  declined: 'not_attending',
});

function normalizeRSVPStatus(status) {
  return RSVP_ALIASES[status] || status;
}

function isValidRSVPStatus(status) {
  return RSVP_STATUSES.includes(status);
}

module.exports = { RSVP_STATUSES, normalizeRSVPStatus, isValidRSVPStatus };
