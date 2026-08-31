const test = require('node:test');
const assert = require('node:assert');
const { calculateNewHandicap } = require('../lib/domain/handicap.js');
const { calculateLeaguePoints } = require('../lib/domain/scoring.js');

test('Domain Logic Tests', async (t) => {  await t.test('Handicap: returns the expected starting value when no prior scores exist', () => {
    assert.strictEqual(calculateNewHandicap([]), 0.0);
  });

  await t.test('Handicap: applies the negative-handicap policy correctly', () => {
    assert.strictEqual(calculateNewHandicap([30]), 0.0);
  });

  await t.test('Handicap: uses prior weeks only', () => {
    assert.strictEqual(calculateNewHandicap([40, 42]), 4.0);
    assert.strictEqual(calculateNewHandicap([40, 42, 45]), 5.1);
  });

  await t.test('Scoring: tied net scores split points correctly', () => {
    const teams = [
      { id: 1, netScore: 34 },
      { id: 2, netScore: 36 },
      { id: 3, netScore: 36 },
      { id: 4, netScore: 40 }
    ];
    const results = calculateLeaguePoints(teams, 4);
    assert.strictEqual(results.find(t => t.id === 1).pointsEarned, 4);
    assert.strictEqual(results.find(t => t.id === 2).pointsEarned, 2.5);
    assert.strictEqual(results.find(t => t.id === 3).pointsEarned, 2.5);
    assert.strictEqual(results.find(t => t.id === 4).pointsEarned, 1);
  });

  await t.test('Scoring: tied teams receive the same rank', () => {
    const teams = [
      { id: 1, netScore: 34 },
      { id: 2, netScore: 36 },
      { id: 3, netScore: 36 },
      { id: 4, netScore: 40 }
    ];
    const results = calculateLeaguePoints(teams, 4);
    assert.strictEqual(results.find(t => t.id === 2).rank, 2);
    assert.strictEqual(results.find(t => t.id === 3).rank, 2);
    assert.strictEqual(results.find(t => t.id === 4).rank, 4);
  });

  await t.test('Standings: cumulative season points and averages are calculated correctly', () => {
    const { calculateSeasonStandings } = require('../lib/domain/scoring.js');
    const teams = [
      { id: 1, name: 'Team A', current_handicap: 4 },
      { id: 2, name: 'Team B', current_handicap: 6 },
      { id: 3, name: 'Team C', current_handicap: 8 }
    ];

    const weeklyResults = [
      {
        weekNumber: 1,
        results: [
          { id: 1, grossScore: 40, netScore: 36, pointsEarned: 3, rank: 1 },
          { id: 2, grossScore: 44, netScore: 38, pointsEarned: 2, rank: 2 },
          { id: 3, grossScore: 48, netScore: 40, pointsEarned: 1, rank: 3 }
        ]
      },
      {
        weekNumber: 2,
        results: [
          { id: 3, grossScore: 42, netScore: 34, pointsEarned: 3, rank: 1 },
          { id: 1, grossScore: 41, netScore: 37, pointsEarned: 2, rank: 2 },
          { id: 2, grossScore: 46, netScore: 40, pointsEarned: 1, rank: 3 }
        ]
      }
    ];

    const standings = calculateSeasonStandings(teams, weeklyResults);

    // Team A: 3 + 2 = 5 pts, played 2, avgNet = (36+37)/2 = 36.5
    // Team C: 1 + 3 = 4 pts, played 2, avgNet = (40+34)/2 = 37.0
    // Team B: 2 + 1 = 3 pts, played 2, avgNet = (38+40)/2 = 39.0

    assert.strictEqual(standings[0].id, 1);
    assert.strictEqual(standings[0].totalPoints, 5);
    assert.strictEqual(standings[0].seasonRank, 1);
    assert.strictEqual(standings[0].weeksPlayed, 2);
    assert.strictEqual(standings[0].avgNet, 36.5);

    assert.strictEqual(standings[1].id, 3);
    assert.strictEqual(standings[1].totalPoints, 4);
    assert.strictEqual(standings[1].seasonRank, 2);

    assert.strictEqual(standings[2].id, 2);
    assert.strictEqual(standings[2].totalPoints, 3);
    assert.strictEqual(standings[2].seasonRank, 3);
  });

  await t.test('Standings: a lower average net score wins a tied-points tiebreaker', () => {
    const { calculateSeasonStandings } = require('../lib/domain/scoring.js');
    const teams = [
      { id: 1, name: 'Team A', current_handicap: 4 },
      { id: 2, name: 'Team B', current_handicap: 6 }
    ];

    const weeklyResults = [
      {
        weekNumber: 1,
        results: [
          { id: 1, grossScore: 40, netScore: 36, pointsEarned: 2, rank: 1 },
          { id: 2, grossScore: 42, netScore: 36, pointsEarned: 2, rank: 1 }
        ]
      },
      {
        weekNumber: 2,
        results: [
          { id: 2, grossScore: 39, netScore: 33, pointsEarned: 2, rank: 1 },
          { id: 1, grossScore: 40, netScore: 36, pointsEarned: 2, rank: 1 }
        ]
      }
    ];

    const standings = calculateSeasonStandings(teams, weeklyResults);
    // Both have 4 points total.
    // Team B avgNet: (36+33)/2 = 34.5
    // Team A avgNet: (36+36)/2 = 36.0
    // Team B should rank 1st because of lower avgNet
    assert.strictEqual(standings[0].id, 2);
    assert.strictEqual(standings[0].seasonRank, 1);
    assert.strictEqual(standings[1].id, 1);
    assert.strictEqual(standings[1].seasonRank, 2);
  });

  await t.test('Course: weather preview and playability-index service work', () => {
    const { getCourseWeather } = require('../lib/services/courseService');
    const weather = getCourseWeather(36.5684, -121.9507);

    assert.ok(weather);
    assert.ok(typeof weather.tempC === 'number');
    assert.ok(typeof weather.tempF === 'number');
    assert.ok(weather.condition);
    assert.ok(weather.golfIndex);
  });

  await t.test('Formats: match play calculates hole by hole and closes a 3 & 2 result correctly', () => {
    const { calculateMatchPlay } = require('../lib/domain/tournamentFormats');
    // Team 1 wins holes 1, 2, 3, 4. Team 2 wins none. By hole 16 (16 holes played, 2 remaining, Team 1 is 4 UP), match ends 4 & 2.
    const t1 = [4, 4, 3, 4, 4, 4, 4, 4, 4,  4, 4, 4, 4, 4, 4, 4, 4, 4];
    const t2 = [5, 5, 4, 5, 4, 4, 4, 4, 4,  4, 4, 4, 4, 4, 4, 4, 4, 4];

    const match = calculateMatchPlay(t1, t2);
    assert.strictEqual(match.winningTeam, 'team1');
    assert.ok(match.finalStatus.includes('Team 1 won'));
  });

  await t.test('Formats: scramble handicap engine applies 2-person and 4-person allowances', () => {
    const { calculateScrambleHandicap } = require('../lib/domain/tournamentFormats');
    // 2-Man: Low 10.0 (35% = 3.5), High 20.0 (15% = 3.0) -> 6.5
    const hcp2 = calculateScrambleHandicap([20.0, 10.0], '2-man');
    assert.strictEqual(hcp2, 6.5);

    // 4-Man: [4.0, 8.0, 12.0, 16.0] -> 4*0.20 + 8*0.15 + 12*0.10 + 16*0.05 = 0.8 + 1.2 + 1.2 + 0.8 = 4.0
    const hcp4 = calculateScrambleHandicap([16.0, 4.0, 12.0, 8.0], '4-man');
    assert.strictEqual(hcp4, 4.0);
  });

  await t.test('Formats: Stableford and Modified Stableford formulas return correct results', () => {
    const { calculateStableford } = require('../lib/domain/tournamentFormats');
    // Par 4 holes: Birdie (3), Par (4), Bogey (5), Double (6), Eagle (2)
    const scores = [3, 4, 5, 6, 2];
    const pars = [4, 4, 4, 4, 4];

    // Standard: Birdie=3, Par=2, Bogey=1, Double=0, Eagle=4 -> 3+2+1+0+4 = 10 pts
    const std = calculateStableford(scores, pars, [0, 0, 0, 0, 0], false);
    assert.strictEqual(std.totalPoints, 10);

    // Modified: Birdie=+2, Par=0, Bogey=-1, Double=-3, Eagle=+5 -> 2+0-1-3+5 = 3 pts
    const mod = calculateStableford(scores, pars, [0, 0, 0, 0, 0], true);
    assert.strictEqual(mod.totalPoints, 3);
  });

  await t.test('Formats: skins and carry-over rules work', () => {
    const { calculateSkins } = require('../lib/domain/tournamentFormats');
    const players = [
      { playerId: 1, name: 'Player A', scores: [4, 4, 3] },
      { playerId: 2, name: 'Player B', scores: [4, 5, 4] }
    ];
    // Hole 1: Tied (4 vs 4) -> Carried Over (pot=1)
    // Hole 2: Player A wins with 4 (takes hole 1 + hole 2 = 2 skins)
    // Hole 3: Player A wins with 3 (takes 1 skin)
    const skins = calculateSkins(players, [1, 1, 1], true);
    assert.strictEqual(skins.skinsWon[1].skinsCount, 3);
    assert.strictEqual(skins.skinsWon[2].skinsCount, 0);
  });

  await t.test('Formats: Nassau, Ryder Cup, and playoff bracket generators work', () => {
    const { calculateNassau, calculateRyderCupSessions, generatePlayoffBracket } = require('../lib/domain/tournamentFormats');

    // Nassau
    const t1 = Array(18).fill(4);
    const t2 = Array(18).fill(5);
    const nassau = calculateNassau(t1, t2);
    assert.strictEqual(nassau.points.team1, 3); // Won Front, Back, Overall

    // Ryder Cup
    const sessions = [
      {
        sessionName: 'Day 1 Foursomes',
        matches: [{ team1Name: 'USA 1', team2Name: 'EUR 1', result: 'team1_won' }]
      }
    ];
    const ryder = calculateRyderCupSessions(sessions);
    assert.strictEqual(ryder.team1Total, 1);

    // Playoff Bracket
    const bracket = generatePlayoffBracket([
      { id: 1, name: 'Team 1' },
      { id: 2, name: 'Team 2' },
      { id: 3, name: 'Team 3' },
      { id: 4, name: 'Team 4' }
    ], 4);

    assert.strictEqual(bracket.quarterOrSemis.length, 2);
    assert.strictEqual(bracket.quarterOrSemis[0].highSeed.name, 'Team 1');
    assert.strictEqual(bracket.quarterOrSemis[0].lowSeed.name, 'Team 4');
  });

  await t.test('WHS: Score Differential and best-8-of-20 Handicap Index follow the WHS formula', () => {
    const { calculateScoreDifferential, calculateWHSHandicapIndex, calculatePlayingHandicap } = require('../lib/domain/whsHandicap');

    // Score Diff: Gross 85, Rating 72.0, Slope 130 -> (113/130)*(85-72) = 0.8692 * 13 = 11.3
    const diff = calculateScoreDifferential(85, 72.0, 130);
    assert.strictEqual(diff, 11.3);

    // 20 Differentials: [10, 10, 10, 10, 10, 10, 10, 10, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20, 20]
    // Best 8 = all 10s -> Average = 10.0
    const diffs20 = [10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0, 20.0];
    const hi = calculateWHSHandicapIndex(diffs20);
    assert.strictEqual(hi, 10.0);

    // Playing Handicap: HI 10.0, Slope 128, Rating 72.4, Par 72
    // CH = 10.0 * (128 / 113) + (72.4 - 72) = 11.327 + 0.4 = 11.727 -> Playing Handicap = 12
    const ph = calculatePlayingHandicap(10.0, 128, 72.4, 72, 100);
    assert.strictEqual(ph.playingHandicap, 12);
  });

  await t.test('WHS: Soft Cap, Hard Cap, ESR, and Net Double Bogey rules work', () => {
    const { applySoftAndHardCaps, calculateExceptionalScoreReduction, calculateNetDoubleBogey } = require('../lib/domain/whsHandicap');

    // Soft Cap: Low HI is 10.0. New Uncapped is 16.0 (increase of 6.0 > 3.0).
    // Excess = 6.0 - 3.0 = 3.0. Soft Capped = 10.0 + 3.0 + 0.5 * 3.0 = 14.5
    const softCapped = applySoftAndHardCaps(16.0, 10.0);
    assert.strictEqual(softCapped, 14.5);

    // Hard Cap: Low HI is 10.0. New Uncapped is 25.0 (increase of 15.0).
    // Hard Capped max is 10.0 + 5.0 = 15.0
    const hardCapped = applySoftAndHardCaps(25.0, 10.0);
    assert.strictEqual(hardCapped, 15.0);

    // ESR: Current HI 15.0, new Differential 5.0 (diff = 10.0 >= 10.0) -> ESR -2.0
    const esr = calculateExceptionalScoreReduction(5.0, 15.0);
    assert.strictEqual(esr.esrApplied, true);
    assert.strictEqual(esr.reduction, -2.0);

    // Net Double Bogey: Par 4, Stroke Index 5, Player Playing Handicap 10
    // Strokes received on hole SI 5 with PH 10 = 1. Net Double Bogey = 4 + 2 + 1 = 7.
    const maxScore = calculateNetDoubleBogey(4, 5, 10);
    assert.strictEqual(maxScore, 7);
  });

  await t.test('Fixtures: round-robin scheduling handles odd, even, and bye cases', () => {
    const { generateRoundRobinMatchups } = require('../lib/services/fixtureService');

    // 4 Teams (Even) -> 3 weeks of 2 matches each = 6 matches total
    const teams4 = [{ id: 1, name: 'T1' }, { id: 2, name: 'T2' }, { id: 3, name: 'T3' }, { id: 4, name: 'T4' }];
    const fix4 = generateRoundRobinMatchups(teams4, 3);
    assert.strictEqual(fix4.length, 6);
    assert.strictEqual(fix4.filter(f => f.is_bye === 1).length, 0);

    // 3 Teams (Odd) -> Auto-adds a Bye (Ghost team)
    const teams3 = [{ id: 1, name: 'T1' }, { id: 2, name: 'T2' }, { id: 3, name: 'T3' }];
    const fix3 = generateRoundRobinMatchups(teams3, 3);
    assert.strictEqual(fix3.length, 6);
    // In 3 weeks, each of the 3 teams gets exactly 1 Bye
    const byeMatches = fix3.filter(f => f.is_bye === 1);
    assert.strictEqual(byeMatches.length, 3);

    const doubleRound = generateRoundRobinMatchups(teams4, 6, true);
    assert.strictEqual(doubleRound.length, 12);
    assert.strictEqual(doubleRound[6].team1_id, doubleRound[0].team2_id);
    assert.strictEqual(doubleRound[6].team2_id, doubleRound[0].team1_id);
  });
});
