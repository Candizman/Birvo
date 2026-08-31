/**
 * What a league's game format actually does to a round's result.
 *
 * Before this existed the format was a label. `leagues.game_format` accepted six
 * values, the admin UI offered all six, and standings scored every one of them as
 * net stroke play without saying so. A league set to "skins" got stroke play and
 * no warning that its format was being ignored.
 *
 * Two things were tangled together in that dropdown:
 *
 *   How the round is scored   stroke play, scramble, stableford, match play.
 *                             Decides each team's result for the week.
 *
 *   Side games                skins and nassau. These run alongside a normal
 *                             round with their own pot; they do not replace the
 *                             league's scoring. Courses run them this way, and a
 *                             league whose "format" is skins still has to rank
 *                             its teams somehow.
 *
 * So a side game leaves the scoring alone and adds a result of its own.
 *
 * THE DATA CONSTRAINT
 *
 * Stableford, match play, skins and nassau all need hole-by-hole scores. Birvo
 * collects those only when a player posts their own card; the paper mode, which
 * is the mode small courses actually use, records a total gross and nothing else.
 *
 * When a round is missing the hole scores its format needs, it is scored as net
 * stroke play -- the only thing the data supports -- and the round is marked so
 * the caller can say so. Silently substituting one format for another is the bug
 * this module exists to fix; refusing to score a round mid-season would be worse.
 */
'use strict';

const {
  calculateStableford,
  calculateMatchPlay,
  calculateSkins,
  calculateNassau,
} = require('./tournamentFormats');

// Points a match play league awards per fixture. Two for a win and one for a
// halve is the usual arrangement.
const MATCH_PLAY_WIN_POINTS = 2;
const MATCH_PLAY_HALVE_POINTS = 1;

const FORMATS = {
  stroke_play: {
    label: 'Stroke play',
    description: 'Net total against the field. Lowest net wins the week.',
    needsHoleScores: false,
    scoring: 'net',
  },
  scramble: {
    label: 'Scramble',
    description: 'A team plays one ball; the card is scored as a net total.',
    needsHoleScores: false,
    scoring: 'net',
  },
  stableford: {
    label: 'Stableford',
    description: 'Points per hole against par, with strokes given. Highest total wins.',
    needsHoleScores: true,
    scoring: 'stableford',
  },
  match_play: {
    label: 'Match play',
    description: 'Team against team, hole by hole. Two points for a win, one for a halve.',
    needsHoleScores: true,
    scoring: 'match',
  },
  skins: {
    label: 'Stroke play with skins',
    description: 'A normal net round, with a skins pot alongside it.',
    needsHoleScores: true,
    scoring: 'net',
    sideGame: 'skins',
  },
  nassau: {
    label: 'Stroke play with nassau',
    description: 'A normal net round, with front nine, back nine and overall bets alongside it.',
    needsHoleScores: true,
    scoring: 'net',
    sideGame: 'nassau',
  },
};

const DEFAULT_FORMAT = 'stroke_play';

function getFormatDefinition(format) {
  return FORMATS[format] || FORMATS[DEFAULT_FORMAT];
}

function listFormats() {
  return Object.entries(FORMATS).map(([value, definition]) => ({ value, ...definition }));
}

/**
 * Where a handicap's strokes fall. One stroke on each of the lowest stroke-index
 * holes, a second time round once the handicap passes the number of holes -- the
 * standard allocation, and the one a printed scorecard assumes.
 */
function allocateStrokes(handicap, holes) {
  const strokes = new Map(holes.map(hole => [Number(hole.hole_number), 0]));
  const whole = Math.max(0, Math.round(Number(handicap) || 0));
  if (whole === 0 || holes.length === 0) return strokes;

  const byDifficulty = [...holes].sort(
    (a, b) => Number(a.stroke_index) - Number(b.stroke_index)
  );
  for (let given = 0; given < whole; given += 1) {
    const hole = byDifficulty[given % byDifficulty.length];
    strokes.set(Number(hole.hole_number), strokes.get(Number(hole.hole_number)) + 1);
  }
  return strokes;
}

function orderedHoleScores(holeRows, holes) {
  const byNumber = new Map(holeRows.map(row => [Number(row.hole_number), Number(row.gross_score)]));
  const ordered = [];
  for (const hole of holes) {
    const value = byNumber.get(Number(hole.hole_number));
    if (!Number.isFinite(value)) return null;
    ordered.push(value);
  }
  return ordered;
}

/**
 * True when every team in the round has a complete hole-by-hole card. A format
 * that compares holes cannot run on a partial field: one missing card and the
 * skins pot or the stableford ranking is wrong rather than incomplete.
 */
function hasCompleteHoleData(teamRounds) {
  return teamRounds.length > 0 && teamRounds.every(round => round.holeGross !== null);
}

function buildTeamRounds({ teams, holeScoresByTeam, holes }) {
  return teams.map(team => {
    const rows = holeScoresByTeam.get(String(team.id)) || [];
    return {
      ...team,
      holeGross: holes.length > 0 ? orderedHoleScores(rows, holes) : null,
      strokes: allocateStrokes(team.handicap, holes),
    };
  });
}

function stablefordResults({ teamRounds, holes }) {
  return teamRounds.map(round => {
    const pars = holes.map(hole => Number(hole.par));
    const strokesPerHole = holes.map(hole => round.strokes.get(Number(hole.hole_number)) || 0);
    const { totalPoints, holePoints } = calculateStableford(round.holeGross, pars, strokesPerHole);
    return {
      ...round,
      stablefordPoints: totalPoints,
      holePoints,
      // calculateLeaguePoints ranks ascending, and stableford is won by the
      // highest total, so the rank value is negated.
      rankValue: -totalPoints,
    };
  });
}

function netHoleScores(round, holes) {
  return holes.map((hole, index) =>
    round.holeGross[index] - (round.strokes.get(Number(hole.hole_number)) || 0)
  );
}

function matchPlayResults({ teamRounds, holes, fixtures }) {
  const roundById = new Map(teamRounds.map(round => [String(round.id), round]));
  const results = new Map(
    teamRounds.map(round => [String(round.id), { ...round, matchPoints: 0, matches: [] }])
  );

  for (const fixture of fixtures) {
    const team1 = roundById.get(String(fixture.team1_id));
    const team2 = roundById.get(String(fixture.team2_id));

    // A bye is a full point: the team is not penalised for the schedule.
    if (fixture.is_bye || !team1 || !team2) {
      const present = team1 || team2;
      if (present) {
        const entry = results.get(String(present.id));
        entry.matchPoints += MATCH_PLAY_WIN_POINTS;
        entry.matches.push({ opponentId: null, opponentName: null, status: 'Bye', outcome: 'bye' });
      }
      continue;
    }

    const outcome = calculateMatchPlay(netHoleScores(team1, holes), netHoleScores(team2, holes));
    const entry1 = results.get(String(team1.id));
    const entry2 = results.get(String(team2.id));

    if (outcome.winningTeam === 'team1') {
      entry1.matchPoints += MATCH_PLAY_WIN_POINTS;
    } else if (outcome.winningTeam === 'team2') {
      entry2.matchPoints += MATCH_PLAY_WIN_POINTS;
    } else {
      entry1.matchPoints += MATCH_PLAY_HALVE_POINTS;
      entry2.matchPoints += MATCH_PLAY_HALVE_POINTS;
    }

    entry1.matches.push({
      opponentId: team2.id, opponentName: team2.name, status: outcome.finalStatus,
      outcome: outcome.winningTeam === 'team1' ? 'won' : outcome.winningTeam === 'team2' ? 'lost' : 'halved',
    });
    entry2.matches.push({
      opponentId: team1.id, opponentName: team1.name, status: outcome.finalStatus,
      outcome: outcome.winningTeam === 'team2' ? 'won' : outcome.winningTeam === 'team1' ? 'lost' : 'halved',
    });
  }

  return [...results.values()];
}

function skinsSideGame({ teamRounds, holes }) {
  const entrants = teamRounds.map(round => ({
    playerId: String(round.id),
    name: round.name,
    scores: netHoleScores(round, holes),
  }));
  const { skinsWon, holeDetails, remainingPot } = calculateSkins(
    entrants, holes.map(() => 1), true
  );
  return {
    type: 'skins',
    basis: 'net',
    winners: Object.entries(skinsWon)
      .map(([teamId, entry]) => ({ teamId, name: entry.name, skins: entry.skinsCount, holes: entry.holes }))
      .filter(entry => entry.skins > 0)
      .sort((a, b) => b.skins - a.skins),
    holeDetails,
    // A tie on the last hole leaves the pot unclaimed. Courses usually carry it
    // to the following week; Birvo reports it rather than deciding for them.
    carriedOver: remainingPot,
  };
}

function nassauSideGame({ teamRounds, holes, fixtures }) {
  if (holes.length < 18) return null;
  const roundById = new Map(teamRounds.map(round => [String(round.id), round]));
  const matches = [];
  for (const fixture of fixtures) {
    const team1 = roundById.get(String(fixture.team1_id));
    const team2 = roundById.get(String(fixture.team2_id));
    if (fixture.is_bye || !team1 || !team2) continue;
    const result = calculateNassau(netHoleScores(team1, holes), netHoleScores(team2, holes));
    matches.push({
      team1: { id: team1.id, name: team1.name, points: result.points.team1 },
      team2: { id: team2.id, name: team2.name, points: result.points.team2 },
      front9: result.front9, back9: result.back9, overall18: result.overall18,
    });
  }
  return { type: 'nassau', basis: 'net', matches };
}

/**
 * The per-team result for one round under the league's format.
 *
 * Returns the teams with whatever value their format ranks on, a note of the
 * basis actually used, and any side game. `holeDataMissing` is set when the
 * format wanted hole scores and the round did not have a complete set, in which
 * case the basis falls back to net stroke play.
 */
function buildRoundFormatResults({
  format,
  teams = [],
  holeScoresByTeam = new Map(),
  holes = [],
  fixtures = [],
}) {
  const definition = getFormatDefinition(format);
  const orderedHoles = [...holes].sort((a, b) => Number(a.hole_number) - Number(b.hole_number));

  if (!definition.needsHoleScores) {
    return {
      format: format || DEFAULT_FORMAT,
      definition,
      teams,
      basis: 'net',
      holeDataMissing: false,
      sideGame: null,
    };
  }

  const teamRounds = buildTeamRounds({ teams, holeScoresByTeam, holes: orderedHoles });
  if (!hasCompleteHoleData(teamRounds) || orderedHoles.length === 0) {
    return {
      format: format || DEFAULT_FORMAT,
      definition,
      teams,
      basis: 'net',
      holeDataMissing: true,
      sideGame: null,
    };
  }

  let scoredTeams = teamRounds;
  if (definition.scoring === 'stableford') {
    scoredTeams = stablefordResults({ teamRounds, holes: orderedHoles });
  } else if (definition.scoring === 'match') {
    scoredTeams = matchPlayResults({ teamRounds, holes: orderedHoles, fixtures });
  }

  let sideGame = null;
  if (definition.sideGame === 'skins') {
    sideGame = skinsSideGame({ teamRounds, holes: orderedHoles });
  } else if (definition.sideGame === 'nassau') {
    sideGame = nassauSideGame({ teamRounds, holes: orderedHoles, fixtures });
  }

  return {
    format: format || DEFAULT_FORMAT,
    definition,
    teams: scoredTeams.map(({ strokes, holeGross, ...rest }) => rest),
    basis: definition.scoring,
    holeDataMissing: false,
    sideGame,
  };
}

module.exports = {
  FORMATS,
  DEFAULT_FORMAT,
  MATCH_PLAY_WIN_POINTS,
  MATCH_PLAY_HALVE_POINTS,
  getFormatDefinition,
  listFormats,
  allocateStrokes,
  buildRoundFormatResults,
};
