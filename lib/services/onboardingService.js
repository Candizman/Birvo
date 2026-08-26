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

function createTenantWorkspace(db, input) {
  const data = validateOnboardingInput(input);

  return db.transaction(() => {
    const existingUser = db.prepare('SELECT id, course_id FROM users WHERE id = ?').get(data.userId);
    if (existingUser?.course_id) {
      throw new OnboardingError('This account already belongs to a course workspace.', 'ALREADY_PROVISIONED');
    }

    const emailOwner = db.prepare('SELECT id FROM users WHERE lower(email) = ? AND id != ?').get(data.email, data.userId);
    if (emailOwner) {
      throw new OnboardingError('This email already belongs to another Birvo account.', 'EMAIL_IN_USE');
    }

    const courseResult = db.prepare(`
      INSERT INTO courses (
        name, stripe_status, primary_color, address, city, state, postal_code,
        country_code, timezone, contact_email, subscription_plan, currency,
        onboarding_completed_at
      ) VALUES (?, 'not_configured', '#1d7a5f', ?, ?, ?, ?, 'US', ?, ?, 'starter', 'USD', CURRENT_TIMESTAMP)
    `).run(
      data.courseName,
      data.address,
      data.city,
      data.state,
      data.postalCode,
      data.timezone,
      data.email,
    );
    const courseId = Number(courseResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO users (id, email, role, course_id)
      VALUES (?, ?, 'course_owner', ?)
      ON CONFLICT(id) DO UPDATE SET
        email = excluded.email,
        role = 'course_owner',
        course_id = excluded.course_id
    `).run(data.userId, data.email, courseId);

    db.prepare(`
      INSERT INTO course_memberships (course_id, user_id, email, role, status)
      VALUES (?, ?, ?, 'course_owner', 'active')
    `).run(courseId, data.userId, data.email);

    const leagueResult = db.prepare(`
      INSERT INTO leagues (
        course_id, name, status, current_week, game_format, season_length_weeks
      ) VALUES (?, ?, 'active', 1, ?, ?)
    `).run(courseId, data.leagueName, data.gameFormat, data.seasonLengthWeeks);

    return {
      courseId,
      leagueId: Number(leagueResult.lastInsertRowid),
      role: 'course_owner',
    };
  })();
}

module.exports = {
  ALLOWED_GAME_FORMATS,
  US_TIMEZONES,
  OnboardingError,
  validateOnboardingInput,
  createTenantWorkspace,
};
