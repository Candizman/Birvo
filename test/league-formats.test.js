/**
 * The league format has to change the result, or it is a label.
 *
 * Before this suite existed `leagues.game_format` accepted six values and
 * standings scored all six as net stroke play. These assertions are the contract
 * that stopped that: each format either changes the week's outcome or says
 * plainly that it could not.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  allocateStrokes,
  buildRoundFormatResults,
  getFormatDefinition,
} = require('../lib/domain/leagueFormats');
const { buildLeagueStandings } = require('../lib/domain/standings');

// A nine-hole course, par 36, with the stroke index following the hole number so
// that the strokes a handicap buys are easy to follow by eye.
const HOLES = [4, 4, 3, 5, 4, 4, 3, 5, 4].map((par, index) => ({
  hole_number: index + 1,
  par,
  stroke_index: index + 1,
}));

const PAR_ROUND = [4, 4, 3, 5, 4, 4, 3, 5, 4];        // 36 gross
const BOGEY_ROUND = [5, 5, 4, 6, 5, 5, 4, 6, 5];      // 45 gross

function holeRows(grossByHole) {
  return grossByHole.map((gross, index) => ({
    hole_number: index + 1,
    gross_score: gross,
  }));
}

function team(id, name, handicap, gross) {
  return { id, name, handicap, currentGross: gross, netScore: gross - handicap, isGhost: false };
}

test('Strokes fall on the hardest holes first', async t => {
  await t.test('a handicap of five buys a stroke on the five lowest stroke indexes', () => {
    const strokes = allocateStrokes(5, HOLES);
    assert.deepStrictEqual([1, 2, 3, 4, 5].map(h => strokes.get(h)), [1, 1, 1, 1, 1]);
    assert.deepStrictEqual([6, 7, 8, 9].map(h => strokes.get(h)), [0, 0, 0, 0]);
  });

  await t.test('a handicap larger than the hole count goes round a second time', () => {
    const strokes = allocateStrokes(11, HOLES);
    assert.deepStrictEqual([1, 2].map(h => strokes.get(h)), [2, 2]);
    assert.deepStrictEqual([3, 9].map(h => strokes.get(h)), [1, 1]);
  });

  await t.test('a scratch team is given nothing', () => {
    const strokes = allocateStrokes(0, HOLES);
    assert.deepStrictEqual([...strokes.values()], new Array(9).fill(0));
  });
});

test('Formats that need no hole scores are unaffected', async t => {
  await t.test('stroke play scores on net and never reports a data gap', () => {
    const result = buildRoundFormatResults({
      format: 'stroke_play',
      teams: [team('t1', 'Eagles', 5, 36)],
      holes: HOLES,
    });
    assert.strictEqual(result.basis, 'net');
    assert.strictEqual(result.holeDataMissing, false);
    assert.strictEqual(result.sideGame, null);
  });

  await t.test('an unknown format falls back to stroke play rather than throwing', () => {
    assert.strictEqual(getFormatDefinition('nonsense').label, 'Stroke play');
  });
});

test('Stableford ranks on points, and the highest total wins the week', async t => {
  const teams = [team('t1', 'Eagles', 5, 36), team('t2', 'Birdies', 5, 45)];
  const holeScoresByTeam = new Map([
    ['t1', holeRows(PAR_ROUND)],
    ['t2', holeRows(BOGEY_ROUND)],
  ]);

  await t.test('points are computed against par with strokes given', () => {
    const result = buildRoundFormatResults({
      format: 'stableford', teams, holeScoresByTeam, holes: HOLES,
    });
    assert.strictEqual(result.basis, 'stableford');
    assert.strictEqual(result.holeDataMissing, false);
    // Five strokes turn five pars into net birdies: 5 x 3 + 4 x 2 = 23.
    assert.strictEqual(result.teams.find(x => x.id === 't1').stablefordPoints, 23);
    // The same five strokes turn five bogeys into net pars: 5 x 2 + 4 x 1 = 14.
    assert.strictEqual(result.teams.find(x => x.id === 't2').stablefordPoints, 14);
  });

  await t.test('the rank value is negated so that the highest total sorts first', () => {
    const result = buildRoundFormatResults({
      format: 'stableford', teams, holeScoresByTeam, holes: HOLES,
    });
    assert.strictEqual(result.teams.find(x => x.id === 't1').rankValue, -23);
    assert.ok(
      result.teams.find(x => x.id === 't1').rankValue
      < result.teams.find(x => x.id === 't2').rankValue
    );
  });

  await t.test('a round with no hole scores falls back to net and admits it', () => {
    const result = buildRoundFormatResults({
      format: 'stableford', teams, holeScoresByTeam: new Map(), holes: HOLES,
    });
    assert.strictEqual(result.basis, 'net');
    assert.strictEqual(result.holeDataMissing, true);
  });

  await t.test('one missing card is enough to stop the format running', () => {
    const partial = new Map([['t1', holeRows(PAR_ROUND)]]);
    const result = buildRoundFormatResults({
      format: 'stableford', teams, holeScoresByTeam: partial, holes: HOLES,
    });
    assert.strictEqual(result.holeDataMissing, true);
  });
});

test('Match play is decided by the fixture, not by the field', async t => {
  const teams = [team('t1', 'Eagles', 5, 36), team('t2', 'Birdies', 5, 45)];
  const holeScoresByTeam = new Map([
    ['t1', holeRows(PAR_ROUND)],
    ['t2', holeRows(BOGEY_ROUND)],
  ]);
  const fixtures = [{ week_number: 1, team1_id: 't1', team2_id: 't2', is_bye: false }];

  await t.test('the winner takes two points and the loser none', () => {
    const result = buildRoundFormatResults({
      format: 'match_play', teams, holeScoresByTeam, holes: HOLES, fixtures,
    });
    assert.strictEqual(result.basis, 'match');
    assert.strictEqual(result.teams.find(x => x.id === 't1').matchPoints, 2);
    assert.strictEqual(result.teams.find(x => x.id === 't2').matchPoints, 0);
  });

  await t.test('the match is reported the way golfers say it', () => {
    const result = buildRoundFormatResults({
      format: 'match_play', teams, holeScoresByTeam, holes: HOLES, fixtures,
    });
    // Five up with four to play closes the match out.
    assert.strictEqual(result.teams.find(x => x.id === 't1').matches[0].status, 'Team 1 won 5 & 4');
    assert.strictEqual(result.teams.find(x => x.id === 't2').matches[0].outcome, 'lost');
  });

  await t.test('an identical card is halved and both teams take a point', () => {
    const level = new Map([['t1', holeRows(PAR_ROUND)], ['t2', holeRows(PAR_ROUND)]]);
    const result = buildRoundFormatResults({
      format: 'match_play',
      teams: [team('t1', 'Eagles', 5, 36), team('t2', 'Birdies', 5, 36)],
      holeScoresByTeam: level, holes: HOLES, fixtures,
    });
    assert.strictEqual(result.teams.find(x => x.id === 't1').matchPoints, 1);
    assert.strictEqual(result.teams.find(x => x.id === 't2').matchPoints, 1);
  });

  await t.test('a bye is a full point, because the schedule is not the team\'s doing', () => {
    const result = buildRoundFormatResults({
      format: 'match_play', teams, holeScoresByTeam, holes: HOLES,
      fixtures: [{ week_number: 1, team1_id: 't1', team2_id: null, is_bye: true }],
    });
    assert.strictEqual(result.teams.find(x => x.id === 't1').matchPoints, 2);
    assert.strictEqual(result.teams.find(x => x.id === 't1').matches[0].outcome, 'bye');
  });
});

test('Skins is a side game, not the league scoring', async t => {
  // Birdies are given a stroke on hole 1 so that the hole is halved and its skin
  // carries into hole 2.
  const carryRound = [4, 5, 4, 6, 5, 5, 4, 6, 5];
  const teams = [team('t1', 'Eagles', 5, 36), team('t2', 'Birdies', 5, 44)];
  const holeScoresByTeam = new Map([
    ['t1', holeRows(PAR_ROUND)],
    ['t2', holeRows(carryRound)],
  ]);

  await t.test('the league is still scored on net', () => {
    const result = buildRoundFormatResults({
      format: 'skins', teams, holeScoresByTeam, holes: HOLES,
    });
    assert.strictEqual(result.basis, 'net');
  });

  await t.test('a halved hole carries its skin into the next one', () => {
    const result = buildRoundFormatResults({
      format: 'skins', teams, holeScoresByTeam, holes: HOLES,
    });
    const winner = result.sideGame.winners.find(entry => entry.teamId === 't1');
    // Hole 1 halved and carried, so hole 2 is worth two; eight holes won in all.
    assert.strictEqual(winner.skins, 9);
    assert.strictEqual(result.sideGame.holeDetails[0].carried, 1);
    assert.strictEqual(result.sideGame.holeDetails[1].skins, 2);
    assert.strictEqual(result.sideGame.carriedOver, 0);
  });

  await t.test('a team that wins nothing is not listed as a winner', () => {
    const result = buildRoundFormatResults({
      format: 'skins', teams, holeScoresByTeam, holes: HOLES,
    });
    assert.ok(!result.sideGame.winners.some(entry => entry.teamId === 't2'));
  });

  await t.test('nassau needs eighteen holes and stays quiet on a nine-hole course', () => {
    const result = buildRoundFormatResults({
      format: 'nassau', teams, holeScoresByTeam, holes: HOLES,
      fixtures: [{ week_number: 1, team1_id: 't1', team2_id: 't2', is_bye: false }],
    });
    assert.strictEqual(result.sideGame, null);
  });
});

test('Standings carry the format through to the caller', async t => {
  const league = {
    id: 'l1', game_format: 'stableford', current_week: 1, season_length_weeks: 1,
  };
  const teams = [
    { id: 't1', name: 'Eagles', status: 'active', current_handicap: 5 },
    { id: 't2', name: 'Birdies', status: 'active', current_handicap: 5 },
  ];
  const matches = [{ id: 'm1', week_number: 1, status: 'locked' }];
  const scores = [
    { id: 's1', match_id: 'm1', team_id: 't1', gross_score: 36, handicap_used: 5, net_score: 31, reconciliation_status: 'ok', is_ghost: false },
    { id: 's2', match_id: 'm1', team_id: 't2', gross_score: 45, handicap_used: 5, net_score: 40, reconciliation_status: 'ok', is_ghost: false },
  ];
  const holeScores = [
    ...holeRows(PAR_ROUND).map(row => ({ ...row, score_id: 's1' })),
    ...holeRows(BOGEY_ROUND).map(row => ({ ...row, score_id: 's2' })),
  ];

  await t.test('a stableford league awards the week on points', () => {
    const standings = buildLeagueStandings({
      league, teams, matches, scores, holeScores, courseHoles: HOLES,
    });
    const week = standings.weeklyResultsList[0];
    assert.strictEqual(week.scoringBasis, 'stableford');
    assert.strictEqual(week.holeDataMissing, false);
    assert.strictEqual(week.results[0].id, 't1');
    assert.strictEqual(week.results[0].pointsEarned, 2);
  });

  await t.test('the same league with no hole scores names the rounds it could not score', () => {
    const standings = buildLeagueStandings({
      league, teams, matches, scores, holeScores: [], courseHoles: HOLES,
    });
    assert.strictEqual(standings.weeklyResultsList[0].holeDataMissing, true);
    assert.deepStrictEqual(standings.summary.format.roundsMissingHoleScores, [1]);
    assert.strictEqual(standings.summary.format.label, 'Stableford');
  });

  // The public standings page read summary.totalWeeks, which the summary has
  // never had, and quietly printed "1 /" with a blank where the season length
  // belonged. Nothing failed; the number was simply undefined. This pins the
  // shape so a renamed field breaks a test rather than a customer's page.
  await t.test('the summary carries exactly the fields the pages read', () => {
    const standings = buildLeagueStandings({
      league, teams, matches, scores, holeScores, courseHoles: HOLES,
    });
    for (const field of [
      'leader', 'completedWeeks', 'scheduledWeeks', 'seasonLengthWeeks',
      'currentWeek', 'leagueAvgNet', 'format',
    ]) {
      assert.ok(field in standings.summary, `summary is missing ${field}`);
    }
    assert.strictEqual(standings.summary.seasonLengthWeeks, 1);
    assert.ok(!('totalWeeks' in standings.summary),
      'totalWeeks is not a field: a page reading it would render a blank');
  });

  await t.test('a stroke play league reports no gap at all', () => {
    const standings = buildLeagueStandings({
      league: { ...league, game_format: 'stroke_play' },
      teams, matches, scores, holeScores: [], courseHoles: HOLES,
    });
    assert.deepStrictEqual(standings.summary.format.roundsMissingHoleScores, []);
    assert.strictEqual(standings.weeklyResultsList[0].scoringBasis, 'net');
    // Lowest net still wins a stroke play week.
    assert.strictEqual(standings.weeklyResultsList[0].results[0].id, 't1');
  });
});
