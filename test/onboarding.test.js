const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabase } = require('../lib/database/createDatabase');
const { runMigrations } = require('../lib/database/migrations');
const {
  OnboardingError,
  validateOnboardingInput,
  createTenantWorkspace,
} = require('../lib/services/onboardingService');
const {
  COURSE_MANAGEMENT_ROLES,
  SCORING_OPERATION_ROLES,
  hasAdminRole,
} = require('../lib/security/adminRoles');

function validInput(overrides = {}) {
  return {
    userId: 'auth-user-1',
    email: 'OWNER@PineValley.example ',
    courseName: ' Pine   Valley Golf Club ',
    address: '1 East Atlantic Avenue',
    city: 'Pine Valley',
    state: 'nj',
    postalCode: '08021',
    timezone: 'America/New_York',
    leagueName: 'Thursday Night League',
    gameFormat: 'stroke_play',
    seasonLengthWeeks: '16',
    ...overrides,
  };
}

test('Tenant onboarding and role boundaries', async (t) => {
  await t.test('normalizes valid US onboarding input and rejects invalid fields', () => {
    const normalized = validateOnboardingInput(validInput());
    assert.equal(normalized.email, 'owner@pinevalley.example');
    assert.equal(normalized.courseName, 'Pine Valley Golf Club');
    assert.equal(normalized.state, 'NJ');
    assert.equal(normalized.seasonLengthWeeks, 16);

    assert.throws(
      () => validateOnboardingInput(validInput({ postalCode: '123' })),
      (error) => error instanceof OnboardingError && /ZIP code/.test(error.message),
    );
    assert.throws(
      () => validateOnboardingInput(validInput({ timezone: 'Europe/Istanbul' })),
      (error) => error instanceof OnboardingError && /US time zone/.test(error.message),
    );
    assert.throws(
      () => validateOnboardingInput(validInput({ seasonLengthWeeks: '0' })),
      (error) => error instanceof OnboardingError && /between 1 and 52/.test(error.message),
    );
  });

  await t.test('creates one neutral tenant workspace in a single transaction', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);

    const result = createTenantWorkspace(db, validInput());
    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(result.courseId);
    const owner = db.prepare('SELECT * FROM users WHERE id = ?').get('auth-user-1');
    const membership = db.prepare('SELECT * FROM course_memberships WHERE user_id = ?').get('auth-user-1');
    const league = db.prepare('SELECT * FROM leagues WHERE id = ?').get(result.leagueId);

    assert.equal(result.role, 'course_owner');
    assert.equal(course.name, 'Pine Valley Golf Club');
    assert.equal(course.state, 'NJ');
    assert.equal(course.country_code, 'US');
    assert.equal(course.stripe_status, 'not_configured');
    assert.equal(course.subscription_plan, 'starter');
    assert.ok(course.onboarding_completed_at);
    assert.equal(owner.course_id, result.courseId);
    assert.equal(owner.role, 'course_owner');
    assert.equal(membership.course_id, result.courseId);
    assert.equal(membership.role, 'course_owner');
    assert.equal(league.course_id, result.courseId);
    assert.equal(league.current_week, 1);
    assert.equal(league.season_length_weeks, 16);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM course_holes').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM course_tee_boxes').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM coupon_codes').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM billing_invoices').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM tv_sponsors').get().count, 0);
  });

  await t.test('rejects duplicate provisioning without changing tenant data', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    createTenantWorkspace(db, validInput());
    const countsBefore = {
      courses: db.prepare('SELECT COUNT(*) count FROM courses').get().count,
      leagues: db.prepare('SELECT COUNT(*) count FROM leagues').get().count,
      users: db.prepare('SELECT COUNT(*) count FROM users').get().count,
    };

    assert.throws(
      () => createTenantWorkspace(db, validInput({ courseName: 'Another Course' })),
      (error) => error instanceof OnboardingError && error.code === 'ALREADY_PROVISIONED',
    );
    assert.deepEqual({
      courses: db.prepare('SELECT COUNT(*) count FROM courses').get().count,
      leagues: db.prepare('SELECT COUNT(*) count FROM leagues').get().count,
      users: db.prepare('SELECT COUNT(*) count FROM users').get().count,
    }, countsBefore);
  });

  await t.test('rolls back course and owner records if league creation fails', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    db.exec(`
      CREATE TRIGGER reject_onboarding_league
      BEFORE INSERT ON leagues
      WHEN NEW.name = 'Rollback League'
      BEGIN
        SELECT RAISE(ABORT, 'forced league failure');
      END;
    `);

    assert.throws(
      () => createTenantWorkspace(db, validInput({ leagueName: 'Rollback League' })),
      /forced league failure/,
    );
    assert.equal(db.prepare('SELECT COUNT(*) count FROM courses').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM users').get().count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM leagues').get().count, 0);
  });

  await t.test('keeps two independently onboarded tenants isolated', () => {
    const db = createDatabase(':memory:');
    runMigrations(db);
    const first = createTenantWorkspace(db, validInput());
    const second = createTenantWorkspace(db, validInput({
      userId: 'auth-user-2',
      email: 'owner@oakmont.example',
      courseName: 'Oakmont Country Club',
      city: 'Oakmont',
      state: 'PA',
      postalCode: '15139',
      leagueName: 'Oakmont Member League',
    }));

    assert.notEqual(first.courseId, second.courseId);
    assert.notEqual(first.leagueId, second.leagueId);
    assert.equal(db.prepare('SELECT course_id FROM users WHERE id = ?').get('auth-user-1').course_id, first.courseId);
    assert.equal(db.prepare('SELECT course_id FROM users WHERE id = ?').get('auth-user-2').course_id, second.courseId);
    assert.equal(db.prepare('SELECT course_id FROM leagues WHERE id = ?').get(first.leagueId).course_id, first.courseId);
    assert.equal(db.prepare('SELECT course_id FROM leagues WHERE id = ?').get(second.leagueId).course_id, second.courseId);
  });

  await t.test('allows scorekeepers to score but never to manage a course', () => {
    assert.equal(hasAdminRole('course_owner', COURSE_MANAGEMENT_ROLES), true);
    assert.equal(hasAdminRole('course_admin', COURSE_MANAGEMENT_ROLES), true);
    assert.equal(hasAdminRole('scorekeeper', COURSE_MANAGEMENT_ROLES), false);
    assert.equal(hasAdminRole('scorekeeper', SCORING_OPERATION_ROLES), true);
    assert.equal(hasAdminRole('assistant_admin', SCORING_OPERATION_ROLES), true);
    assert.equal(hasAdminRole('unknown', SCORING_OPERATION_ROLES), false);
    assert.equal(hasAdminRole(null, COURSE_MANAGEMENT_ROLES), false);
  });
});
