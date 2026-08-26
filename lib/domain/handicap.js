const PAR = 36;
const MULTIPLIER = 0.8;

function calculateNewHandicap(allGrossScores, par = PAR) {
  if (!allGrossScores || allGrossScores.length === 0) return 0.0;

  const total = allGrossScores.reduce((sum, score) => sum + score, 0);
  const avg = total / allGrossScores.length;

  const handicap = (avg - par) * MULTIPLIER;
  return Math.max(0.0, Number(handicap.toFixed(1)));
}

module.exports = { calculateNewHandicap };
