/**
 * BIRVO TOURNAMENT & LEAGUE FORMATS ENGINE (PHASE 2)
 * Pure domain logic supporting all standard global golf competition formats.
 */

// 11. Individual Stroke Play (Gross and Net)
function calculateStrokePlay(grossScores, playingHandicap = 0) {
  const totalGross = grossScores.reduce((sum, s) => sum + s, 0);
  const totalNet = Number((totalGross - playingHandicap).toFixed(1));
  return { totalGross, playingHandicap, totalNet };
}

// 12. Match Play (1v1 & 2v2 Hole-by-Hole with Up/Down/Halved and Dormie logic)
function calculateMatchPlay(team1NetByHole, team2NetByHole) {
  const totalHoles = Math.min(team1NetByHole.length, team2NetByHole.length);
  let team1Score = 0; // positive = Team 1 up, negative = Team 2 up
  const holeResults = [];

  let matchEnded = false;
  let finalStatus = 'All Square';
  let winningTeam = null;

  for (let i = 0; i < totalHoles; i++) {
    const t1 = team1NetByHole[i];
    const t2 = team2NetByHole[i];

    let holeWinner = 'halved';
    if (t1 < t2) {
      team1Score += 1;
      holeWinner = 'team1';
    } else if (t2 < t1) {
      team1Score -= 1;
      holeWinner = 'team2';
    }

    const holesRemaining = totalHoles - (i + 1);

    let statusText = 'AS';
    if (team1Score > 0) statusText = `${team1Score} UP`;
    else if (team1Score < 0) statusText = `${Math.abs(team1Score)} UP`;

    holeResults.push({
      hole: i + 1,
      team1Net: t1,
      team2Net: t2,
      holeWinner,
      team1Score,
      statusText
    });

    // Check if match is won before 18th hole (e.g. 3 & 2)
    if (Math.abs(team1Score) > holesRemaining && !matchEnded) {
      matchEnded = true;
      const margin = `${Math.abs(team1Score)} & ${holesRemaining}`;
      winningTeam = team1Score > 0 ? 'team1' : 'team2';
      finalStatus = `${team1Score > 0 ? 'Team 1' : 'Team 2'} won ${margin}`;
    }
  }

  if (!matchEnded) {
    if (team1Score > 0) {
      finalStatus = `Team 1 won ${team1Score} UP`;
      winningTeam = 'team1';
    } else if (team1Score < 0) {
      finalStatus = `Team 2 won ${Math.abs(team1Score)} UP`;
      winningTeam = 'team2';
    } else {
      finalStatus = 'Halved (A/S)';
      winningTeam = 'halved';
    }
  }

  return {
    winningTeam,
    finalStatus,
    finalScore: team1Score,
    holeResults
  };
}

// 13. Scramble handicap and score calculation (2-person and 4-person USGA standards)
function calculateScrambleHandicap(teamHandicaps, format = '2-man') {
  const sorted = [...teamHandicaps].sort((a, b) => a - b);
  if (format === '2-man') {
    // 35% low handicap + 15% high handicap
    const low = sorted[0] || 0;
    const high = sorted[1] || 0;
    return Number((low * 0.35 + high * 0.15).toFixed(1));
  } else {
    // 4-Man: 20% A + 15% B + 10% C + 5% D
    const [a = 0, b = 0, c = 0, d = 0] = sorted;
    return Number((a * 0.20 + b * 0.15 + c * 0.10 + d * 0.05).toFixed(1));
  }
}

// 14. Stableford and Modified Stableford scoring
function calculateStableford(holeGrossScores, holePars, holeHandicaps = [], modified = false) {
  let totalPoints = 0;
  const holePoints = [];

  for (let i = 0; i < holeGrossScores.length; i++) {
    const gross = holeGrossScores[i];
    const par = holePars[i] || 4;
    const strokeAlloc = holeHandicaps[i] || 0;
    const net = gross - strokeAlloc;
    const diff = net - par; // -2: Eagle, -1: Birdie, 0: Par, +1: Bogey, +2: Double

    let points = 0;
    if (!modified) {
      // Standard Stableford
      if (diff <= -3) points = 5; // Albatross
      else if (diff === -2) points = 4; // Eagle
      else if (diff === -1) points = 3; // Birdie
      else if (diff === 0) points = 2;  // Par
      else if (diff === 1) points = 1;  // Bogey
      else points = 0;                 // Double Bogey or worse
    } else {
      // Modified Stableford (PGA Tour The American Express style)
      if (diff <= -3) points = 8;  // Double Eagle
      else if (diff === -2) points = 5;  // Eagle
      else if (diff === -1) points = 2;  // Birdie
      else if (diff === 0) points = 0;   // Par
      else if (diff === 1) points = -1;  // Bogey
      else points = -3;                 // Double Bogey or worse
    }

    totalPoints += points;
    holePoints.push({
      hole: i + 1,
      gross,
      net,
      par,
      points
    });
  }

  return { totalPoints, holePoints };
}

// 15. Best Ball (Four-Ball): select the team's best net score on each hole
function calculateBestBall(playerNetScoresMatrix) {
  // playerNetScoresMatrix: [[p1_h1, p1_h2...], [p2_h1, p2_h2...]]
  const totalHoles = playerNetScoresMatrix[0].length;
  const teamCard = [];
  let totalBestNet = 0;

  for (let h = 0; h < totalHoles; h++) {
    const holeScores = playerNetScoresMatrix.map(p => p[h]);
    const bestScore = Math.min(...holeScores);
    teamCard.push(bestScore);
    totalBestNet += bestScore;
  }

  return { totalBestNet, teamCard };
}

// 16. Skins Game (Gross and Net with Carry-over)
function calculateSkins(playersHoleScores, holeValues = [], carryOver = true) {
  // playersHoleScores: [{ playerId, name, scores: [h1, h2...] }]
  const numHoles = playersHoleScores[0].scores.length;
  let carriedSkins = 0;
  const skinsWon = {};
  playersHoleScores.forEach(p => skinsWon[p.playerId] = { name: p.name, skinsCount: 0, holes: [] });

  const holeDetails = [];

  for (let h = 0; h < numHoles; h++) {
    const baseVal = holeValues[h] || 1;
    const pot = baseVal + (carryOver ? carriedSkins : 0);

    const scoresOnHole = playersHoleScores.map(p => ({ playerId: p.playerId, name: p.name, score: p.scores[h] }));
    scoresOnHole.sort((a, b) => a.score - b.score);

    const lowest = scoresOnHole[0].score;
    const tiedCount = scoresOnHole.filter(s => s.score === lowest).length;

    if (tiedCount === 1) {
      const winner = scoresOnHole[0];
      skinsWon[winner.playerId].skinsCount += pot;
      skinsWon[winner.playerId].holes.push({ hole: h + 1, skins: pot, score: lowest });
      holeDetails.push({ hole: h + 1, winner: winner.name, skins: pot, score: lowest, carried: 0 });
      carriedSkins = 0;
    } else {
      if (carryOver) carriedSkins = pot;
      holeDetails.push({ hole: h + 1, winner: 'Tied (Carried Over)', skins: 0, score: lowest, carried: carryOver ? pot : 0 });
    }
  }

  return { skinsWon, holeDetails, remainingPot: carriedSkins };
}

// 17. Nassau format (front 9, back 9, overall 18)
function calculateNassau(team1Scores, team2Scores) {
  const f9_t1 = team1Scores.slice(0, 9);
  const f9_t2 = team2Scores.slice(0, 9);
  const b9_t1 = team1Scores.slice(9, 18);
  const b9_t2 = team2Scores.slice(9, 18);

  const front9 = calculateMatchPlay(f9_t1, f9_t2);
  const back9 = calculateMatchPlay(b9_t1, b9_t2);
  const overall18 = calculateMatchPlay(team1Scores, team2Scores);

  let team1Points = 0;
  let team2Points = 0;

  const evaluatePart = (res) => {
    if (res.winningTeam === 'team1') team1Points += 1;
    else if (res.winningTeam === 'team2') team2Points += 1;
    else { team1Points += 0.5; team2Points += 0.5; }
  };

  evaluatePart(front9);
  evaluatePart(back9);
  evaluatePart(overall18);

  return {
    front9: { status: front9.finalStatus, winner: front9.winningTeam },
    back9: { status: back9.finalStatus, winner: back9.winningTeam },
    overall18: { status: overall18.finalStatus, winner: overall18.winningTeam },
    points: { team1: team1Points, team2: team2Points }
  };
}

// 18. Ryder Cup-style multi-session scoring
function calculateRyderCupSessions(sessions) {
  // sessions: Array<{ sessionName, matches: Array<{ team1Name, team2Name, result: 'team1_won'|'team2_won'|'halved' }> }>
  let team1Total = 0;
  let team2Total = 0;

  const sessionSummaries = sessions.map(s => {
    let t1Session = 0;
    let t2Session = 0;

    s.matches.forEach(m => {
      if (m.result === 'team1_won') { t1Session += 1; team1Total += 1; }
      else if (m.result === 'team2_won') { t2Session += 1; team2Total += 1; }
      else { t1Session += 0.5; t2Session += 0.5; team1Total += 0.5; team2Total += 0.5; }
    });

    return { sessionName: s.sessionName, team1Points: t1Session, team2Points: t2Session };
  });

  const neededToWin = 14.5; // Standard 28 points Ryder Cup
  let winner = null;
  if (team1Total >= neededToWin) winner = 'Team 1';
  else if (team2Total >= neededToWin) winner = 'Team 2';

  return { team1Total, team2Total, winner, sessionSummaries };
}

// 19. Multi-round tournament and cut-line elimination
function calculateMultiRoundWithCut(playersRoundScores, cutTopPercent = 50, afterRound = 2) {
  // playersRoundScores: [{ id, name, rounds: [r1_gross, r2_gross, r3_gross, r4_gross] }]
  const processed = playersRoundScores.map(p => {
    const playedSoFar = p.rounds.slice(0, afterRound).filter(r => typeof r === 'number');
    const totalSoFar = playedSoFar.reduce((sum, r) => sum + r, 0);
    return { ...p, totalSoFar };
  });

  processed.sort((a, b) => a.totalSoFar - b.totalSoFar);

  const cutIndex = Math.ceil(processed.length * (cutTopPercent / 100));
  const cutScoreThreshold = processed[cutIndex - 1]?.totalSoFar || 999;

  const finalPlayers = processed.map(p => ({
    ...p,
    madeCut: p.totalSoFar <= cutScoreThreshold,
    totalGross: p.rounds.filter(r => typeof r === 'number').reduce((s, r) => s + r, 0)
  }));

  return {
    cutScoreThreshold,
    players: finalPlayers
  };
}

// 20. Playoff bracket generator
function generatePlayoffBracket(standings, bracketSize = 4) {
  // Takes top N teams from standings and builds single-elimination tournament
  const qualified = standings.slice(0, bracketSize);
  const matchups = [];

  for (let i = 0; i < bracketSize / 2; i++) {
    const seed1 = qualified[i];
    const seed2 = qualified[bracketSize - 1 - i];
    matchups.push({
      matchNumber: i + 1,
      round: 'Semi-Finals',
      highSeed: seed1 ? { id: seed1.id, name: seed1.name, seed: i + 1 } : null,
      lowSeed: seed2 ? { id: seed2.id, name: seed2.name, seed: bracketSize - i } : null,
      winner: null
    });
  }

  return {
    bracketSize,
    quarterOrSemis: matchups,
    finals: { matchNumber: 'Final', round: 'Championship Match', team1: null, team2: null, champion: null }
  };
}

module.exports = {
  calculateStrokePlay,
  calculateMatchPlay,
  calculateScrambleHandicap,
  calculateStableford,
  calculateBestBall,
  calculateSkins,
  calculateNassau,
  calculateRyderCupSessions,
  calculateMultiRoundWithCut,
  generatePlayoffBracket
};
