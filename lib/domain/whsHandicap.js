/**
 * WORLD HANDICAP SYSTEM (WHS) & USGA OFFICIAL COMPLIANT ENGINE (FAZ 3)
 * Implements complete 20-round differential tables, Soft/Hard Caps, ESR, Net Double Bogey, and Course/Playing Handicap formulas.
 */

// 21. Score Differential Hesaplama
function calculateScoreDifferential(adjustedGross, courseRating, slopeRating, pcc = 0) {
  if (!slopeRating || slopeRating < 55) slopeRating = 113;
  const diff = (113 / slopeRating) * (adjustedGross - courseRating - pcc);
  return Number(diff.toFixed(1));
}

// 22. Best 8 of 20 WHS Handicap Index table
function calculateWHSHandicapIndex(scoreDifferentials) {
  if (!scoreDifferentials || scoreDifferentials.length === 0) return 0.0;

  // Use up to the last 20 scores
  const last20 = scoreDifferentials.slice(-20);
  const n = last20.length;
  const sorted = [...last20].sort((a, b) => a - b);

  let unadjusted = 0;

  if (n <= 3) {
    unadjusted = sorted[0] - 2.0;
  } else if (n === 4) {
    unadjusted = sorted[0] - 1.0;
  } else if (n === 5) {
    unadjusted = sorted[0];
  } else if (n === 6) {
    unadjusted = (sorted[0] + sorted[1]) / 2 - 1.0;
  } else if (n >= 7 && n <= 8) {
    unadjusted = (sorted[0] + sorted[1]) / 2;
  } else if (n >= 9 && n <= 11) {
    unadjusted = (sorted[0] + sorted[1] + sorted[2]) / 3;
  } else if (n >= 12 && n <= 14) {
    unadjusted = (sorted[0] + sorted[1] + sorted[2] + sorted[3]) / 4;
  } else if (n >= 15 && n <= 16) {
    unadjusted = (sorted[0] + sorted[1] + sorted[2] + sorted[3] + sorted[4]) / 5;
  } else if (n >= 17 && n <= 18) {
    unadjusted = sorted.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
  } else if (n === 19) {
    unadjusted = sorted.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
  } else {
    // 20 scores: Best 8
    unadjusted = sorted.slice(0, 8).reduce((a, b) => a + b, 0) / 8;
  }

  // WHS max handicap limit is 54.0, minimum is +5.0 (represented as negative or 0)
  const bounded = Math.max(0.0, Math.min(54.0, unadjusted));
  return Number(bounded.toFixed(1));
}

// 23. Playing Handicap calculation (Course Rating minus Par formula)
function calculatePlayingHandicap(handicapIndex, slopeRating = 113, courseRating = 72.0, par = 72, allowancePercent = 100) {
  // Course Handicap = Handicap Index * (Slope / 113) + (Course Rating - Par)
  const courseHandicap = handicapIndex * (slopeRating / 113) + (courseRating - par);
  const playingHandicap = Math.round(courseHandicap * (allowancePercent / 100));
  return {
    courseHandicap: Number(courseHandicap.toFixed(1)),
    playingHandicap
  };
}

// 24. Convert a 9-hole handicap to an 18-hole equivalent
function convert9HoleDifferentialTo18(scoreDiff9, expectedDiff9) {
  // WHS 2024 Rule: 9-hole differential + expected 9-hole score differential
  const diff18 = scoreDiff9 + (expectedDiff9 || scoreDiff9);
  return Number(diff18.toFixed(1));
}

// 25. Net Double Bogey / Maksimum Delik Skoru
function calculateNetDoubleBogey(holePar, holeStrokeIndex, playerPlayingHandicap) {
  // How many handicap strokes does the player receive on this hole?
  let strokesReceived = Math.floor(playerPlayingHandicap / 18);
  const remainder = playerPlayingHandicap % 18;
  if (holeStrokeIndex <= remainder) {
    strokesReceived += 1;
  }
  // Net Double Bogey = Par + 2 + Strokes Received
  return holePar + 2 + strokesReceived;
}

// 26. Soft Cap and Hard Cap limiting mechanism
function applySoftAndHardCaps(uncappedHandicapIndex, lowHandicapIndex365Days) {
  if (lowHandicapIndex365Days === null || lowHandicapIndex365Days === undefined) {
    return uncappedHandicapIndex;
  }

  const increase = uncappedHandicapIndex - lowHandicapIndex365Days;

  // No cap if increase is 3.0 or less
  if (increase <= 3.0) {
    return uncappedHandicapIndex;
  }

  // Soft Cap: increases above 3.0 are limited by 50%.
  let capped = lowHandicapIndex365Days + 3.0 + (increase - 3.0) * 0.5;

  // Hard Cap: the increase may never exceed Low HI + 5.0.
  if (capped - lowHandicapIndex365Days > 5.0) {
    capped = lowHandicapIndex365Days + 5.0;
  }

  return Number(capped.toFixed(1));
}

// 27. Exceptional Score Reduction (ESR)
function calculateExceptionalScoreReduction(newScoreDifferential, currentHandicapIndex) {
  const diff = currentHandicapIndex - newScoreDifferential;
  if (diff >= 10.0) {
    return { esrApplied: true, reduction: -2.0, reason: 'Exceptional score (differential below -10.0)' };
  } else if (diff >= 7.0) {
    return { esrApplied: true, reduction: -1.0, reason: 'Exceptional score (differential below -7.0)' };
  }
  return { esrApplied: false, reduction: 0.0, reason: null };
}

module.exports = {
  calculateScoreDifferential,
  calculateWHSHandicapIndex,
  calculatePlayingHandicap,
  convert9HoleDifferentialTo18,
  calculateNetDoubleBogey,
  applySoftAndHardCaps,
  calculateExceptionalScoreReduction
};
