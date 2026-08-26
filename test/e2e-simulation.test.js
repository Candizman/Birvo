const test = require('node:test');
const assert = require('node:assert');
const { createDatabase } = require('../lib/database/createDatabase');
const { runMigrations } = require('../lib/database/migrations');
const { getCourseDetails, initializeCourseHolesAndTees, generateShotgunSchedule, getCourseWeather } = require('../lib/services/courseService');
const { calculateMatchPlayHoleByHole, calculateScrambleHandicap, calculateStablefordPoints } = require('../lib/domain/tournamentFormats');
const { calculateScoreDifferential, calculateHandicapIndex, calculatePlayingHandicap } = require('../lib/domain/whsHandicap');
const { generateRoundRobinMatchups, generateICalCalendar, saveRSVP } = require('../lib/services/fixtureService');
const { submitHoleByHoleScore, attestScore, getTeamHoleStats } = require('../lib/services/liveScoringService');
const { getPlayerProfile, updatePlayerProfile, addClubToBag, awardBadge } = require('../lib/services/playerService');
const { getTVDisplayData, addTVSponsor } = require('../lib/services/tvService');
const { getCourseHoleDifficultyStats, getPlayerFormTrend, getWeeklyDigest, generateCSVExport } = require('../lib/services/reportService');
const { getBillingDetails, applyCoupon, updateSubscriptionPlan } = require('../lib/services/billingService');
const { checkRateLimit, clearRateLimits } = require('../lib/security/rateLimiter');
const { ROLES, hasPermission } = require('../lib/security/rbac');

test('🚀 MASTER E2E 100-TASK GOLF LEAGUE SIMULATION', async (t) => {
  const db = createDatabase(':memory:');

  // Step 1: Run the complete current schema.
  const migResult = runMigrations(db, 17);
  assert.strictEqual(migResult.status, 'success');
  assert.strictEqual(migResult.currentVersion, 17);

  // Step 2: Course & Holes Setup
  db.exec(`INSERT INTO courses (id, name, city, subscription_plan) VALUES (1, 'Antalya Golf Resort', 'Antalya', 'pro_club');`);
  initializeCourseHolesAndTees(db, 1);
  const courseDetails = getCourseDetails(db, 1);
  assert.strictEqual(courseDetails.holes.length, 18);
  assert.strictEqual(courseDetails.teeBoxes.length, 4);

  // Step 3: League & 8 Teams Setup
  db.exec(`INSERT INTO leagues (id, course_id, name, game_format, current_week) VALUES (1, 1, 'Championship League 2026', 'stroke_play', 1);`);
  const teamNames = ['Kemer Eagles', 'Belek Birdies', 'Toros Fairways', 'Lycian Pars', 'Aspendos Wedges', 'Side Putters', 'Perge Irons', 'Alanya Drivers'];
  const teamObjects = [];
  teamNames.forEach((name, i) => {
    const res = db.prepare(`
      INSERT INTO teams (league_id, name, current_handicap, pin, status)
      VALUES (1, ?, ?, ?, 'active')
    `).run(name, (i * 2.5), `100${i}`);
    teamObjects.push({ id: res.lastInsertRowid, name });
  });
  assert.strictEqual(teamObjects.length, 8);

  // Step 4: Round-Robin Fixtures Generator
  const fixtures = generateRoundRobinMatchups(teamObjects, 7);
  assert.strictEqual(fixtures.length, 28); // 7 weeks * 4 matches = 28 matches

  // Step 5: Player RSVPs for Week 1
  saveRSVP(db, teamObjects[0].id, 1, 'confirmed');
  saveRSVP(db, teamObjects[1].id, 1, 'confirmed');

  // Step 6: Week 1 Matches & Hole-by-Hole Live Scoring
  db.exec(`
    INSERT INTO matches (id, league_id, week_number) VALUES (1, 1, 1);
  `);

  // Simulate Team 1 (Kemer Eagles, HI: 0.0) playing Match 1
  const holeDetailsT1 = courseDetails.holes.map(h => ({
    holeNumber: h.hole_number,
    grossScore: h.par, // Even par 72
    putts: 2,
    fairwayHit: true,
    gir: true,
    sandSave: false
  }));
  const scoreT1 = submitHoleByHoleScore(db, {
    matchId: 1,
    teamId: teamObjects[0].id,
    handicapUsed: 0.0,
    holeDetails: holeDetailsT1
  });
  assert.strictEqual(scoreT1.totalGross, 72);
  assert.strictEqual(scoreT1.netScore, 72.0);

  // Simulate Team 2 (Belek Birdies, HI: 2.5) playing Match 1
  const holeDetailsT2 = courseDetails.holes.map(h => ({
    holeNumber: h.hole_number,
    grossScore: h.par + 1, // 90 gross
    putts: 2,
    fairwayHit: true,
    gir: false,
    sandSave: false
  }));
  const scoreT2 = submitHoleByHoleScore(db, {
    matchId: 1,
    teamId: teamObjects[1].id,
    handicapUsed: 3.0,
    holeDetails: holeDetailsT2
  });

  // Step 7: Verify a score with the opponent PIN (attestation).
  const attestRes = attestScore(db, scoreT1.scoreId, teamObjects[1].id, '1001');
  assert.strictEqual(attestRes.success, true);

  // Step 8: WHS Handicap Engine
  const scoreDiff = calculateScoreDifferential(72, 72.0, 113);
  assert.strictEqual(scoreDiff, 0.0);

  // Step 9: Player Profile, Bag & Badges
  awardBadge(db, teamObjects[0].id, 'even_par_master', 'Even Par Master', '⛳');
  addClubToBag(db, teamObjects[0].id, { clubName: 'Driver', brand: 'TaylorMade Qi10', avgDistanceYards: 290 });
  const profile = getPlayerProfile(db, teamObjects[0].id);
  assert.strictEqual(profile.badges.length, 1);
  assert.strictEqual(profile.clubs.length, 1);

  // Step 10: Clubhouse TV Display & Sponsor Showcase
  addTVSponsor(db, {
    courseId: 1, leagueId: 1, actorUserId: 'owner-1', name: 'Titleist Golf', logoUrl: '', displayOrder: 1,
  });
  const tvData = getTVDisplayData(db, 1);
  assert.ok(tvData);
  assert.strictEqual(tvData.sponsors.length, 1);

  // Step 11: Analytics, Difficulty & CSV Export
  const diffStats = getCourseHoleDifficultyStats(db, 1);
  assert.strictEqual(diffStats.length, 18);
  const csv = generateCSVExport(db, 1);
  assert.ok(csv.includes('Kemer Eagles'));
  assert.ok(csv.includes('Belek Birdies'));

  // Step 12: Billing SaaS & Promo Coupon
  const { createCoupon } = require('../lib/services/billingService');
  createCoupon(db, 1, { code: 'BIRVO20', discountType: 'percent', discountValue: 20, maxUses: 50 });
  const billing = getBillingDetails(db, 1);
  assert.strictEqual(billing.currentPlan.id, 'pro_club');
  const discountRes = applyCoupon(db, 1, 'BIRVO20', 149.0);
  assert.strictEqual(discountRes.savings, 29.8);

  // Step 13: RBAC & Rate Limiting Security
  assert.strictEqual(hasPermission(ROLES.CLUB_ADMIN, 'MANAGE_LEAGUES'), true);
  assert.strictEqual(hasPermission(ROLES.PLAYER, 'MANAGE_BILLING'), false);

  clearRateLimits();
  const rl1 = checkRateLimit('login_1000', 3, 10000);
  assert.strictEqual(rl1.allowed, true);
  checkRateLimit('login_1000', 3, 10000);
  checkRateLimit('login_1000', 3, 10000);
  const rlBlocked = checkRateLimit('login_1000', 3, 10000);
  assert.strictEqual(rlBlocked.allowed, false);

  db.close();
});
