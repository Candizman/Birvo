/**
 * Onboarding input validation.
 *
 * The workspace itself is created by the create_tenant_workspace function in
 * PostgreSQL, which inserts the course, the owner membership, the first league
 * and the setup checklist in one transaction and re-validates every field. What
 * remains here is the client-side validation that gives the operator a specific
 * message per field before the round trip.
 */
const ALLOWED_GAME_FORMATS = new Set([
  'stroke_play',
  'match_play',
  'stableford',
  'scramble',
  'skins',
  'nassau',
]);

const US_TIMEZONES = new Set([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
]);

class OnboardingError extends Error {
  constructor(message, code = 'INVALID_ONBOARDING') {
    super(message);
    this.name = 'OnboardingError';
    this.code = code;
  }
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function assertLength(value, label, min, max) {
  if (value.length < min || value.length > max) {
    throw new OnboardingError(`${label} must be between ${min} and ${max} characters.`);
  }
}

function validateOnboardingInput(input) {
  const userId = cleanText(input.userId);
  const email = cleanText(input.email).toLowerCase();
  const courseName = cleanText(input.courseName);
  const address = cleanText(input.address);
  const city = cleanText(input.city);
  const state = cleanText(input.state).toUpperCase();
  const postalCode = cleanText(input.postalCode);
  const timezone = cleanText(input.timezone);
  const leagueName = cleanText(input.leagueName);
  const gameFormat = cleanText(input.gameFormat) || 'stroke_play';
  const seasonLengthWeeks = Number(input.seasonLengthWeeks);

  assertLength(userId, 'User ID', 1, 160);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new OnboardingError('A valid account email is required.');
  }
  assertLength(courseName, 'Course name', 2, 120);
  if (address.length > 180) throw new OnboardingError('Street address must be 180 characters or fewer.');
  assertLength(city, 'City', 2, 80);
  if (!/^[A-Z]{2}$/.test(state)) throw new OnboardingError('Use a valid two-letter US state code.');
  if (postalCode && !/^\d{5}(?:-\d{4})?$/.test(postalCode)) {
    throw new OnboardingError('Use a valid US ZIP code.');
  }
  if (!US_TIMEZONES.has(timezone)) throw new OnboardingError('Select a supported US time zone.');
  assertLength(leagueName, 'League name', 2, 100);
  if (!ALLOWED_GAME_FORMATS.has(gameFormat)) throw new OnboardingError('Select a supported scoring format.');
  if (!Number.isInteger(seasonLengthWeeks) || seasonLengthWeeks < 1 || seasonLengthWeeks > 52) {
    throw new OnboardingError('Season length must be between 1 and 52 weeks.');
  }

  return {
    userId,
    email,
    courseName,
    address,
    city,
    state,
    postalCode,
    timezone,
    leagueName,
    gameFormat,
    seasonLengthWeeks,
  };
}

module.exports = {
  ALLOWED_GAME_FORMATS,
  US_TIMEZONES,
  OnboardingError,
  validateOnboardingInput,
};
