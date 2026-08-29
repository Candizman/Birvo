const { verifyTeamPin, isHashedTeamPin, hashTeamPin } = require('../security/pin');
const playerRepository = require('../data/supabase/playerRepository');
const operationsRepository = require('../data/supabase/operationsRepository');

/**
 * Derives fairways in regulation, greens in regulation, putting average and sand
 * saves from a hole-by-hole card. Pure: the caller supplies the pars.
 */
function calculateAdvancedStats(holeDetails, holePars) {
  let totalGross = 0;
  let totalPutts = 0;
  let firPossible = 0;
  let firHit = 0;
  let girHit = 0;
  let sandSaves = 0;

  for (let i = 0; i < holeDetails.length; i++) {
    const h = holeDetails[i];
    const par = holePars[i] || 4;
    const gross = h.gross_score !== undefined ? h.gross_score : (h.grossScore !== undefined ? h.grossScore : 4);
    const putts = h.putts !== undefined ? h.putts : 2;
    const fairwayHit = h.fairway_hit !== undefined ? h.fairway_hit : (h.fairwayHit !== undefined ? h.fairwayHit : false);
    const sandSave = h.sand_saves !== undefined ? h.sand_saves : (h.sandSave !== undefined ? h.sandSave : false);

    totalGross += gross;
    totalPutts += putts;

    // FIR (Fairway in Regulation): only on Par 4 and Par 5
    if (par > 3) {
      firPossible++;
      if (fairwayHit) firHit++;
    }

    // GIR (Green in Regulation): reached green in (Par - 2) strokes or fewer
    const shotsToGreen = gross - putts;
    if (shotsToGreen <= par - 2) {
      girHit++;
    }

    if (sandSave) sandSaves++;
  }

  const holesCount = holeDetails.length || 18;
  const firPercent = firPossible > 0 ? Number(((firHit / firPossible) * 100).toFixed(1)) : 100.0;
  const girPercent = Number(((girHit / holesCount) * 100).toFixed(1));
  const avgPuttsPerHole = Number((totalPutts / holesCount).toFixed(2));

  return {
    totalGross,
    totalPutts,
    firPercent,
    girPercent,
    avgPuttsPerHole,
    sandSaves
  };
}

/**
 * Saves a player's hole-by-hole card. Round assignment, lock state, hole-count
 * validation, the gross total and the handicap recalculation are all enforced
 * inside the submit_player_hole_scorecard function in PostgreSQL.
 */
async function submitLiveRound(client, session, matchId, weekNumber, holes, photoUrl) {
  return operationsRepository.submitPlayerHoleScorecard(client, {
    teamId: session.teamId,
    matchId,
    holes,
    photoUrl,
  });
}

/**
 * Attests a card with the assigned opponent's PIN. The opponent relationship is
 * resolved from the week's fixture, so a team cannot attest against an arbitrary
 * other team. A legacy plaintext PIN is upgraded to a hash on first successful use.
 */
async function attestOwnScore(client, session, scoreId, pin) {
  const context = await playerRepository.getPlayerScoreOpponent(client, { teamId: session.teamId, scoreId });
  if (!context || !verifyTeamPin(pin, context.opponent.pin)) {
    throw new Error('The opponent PIN could not be verified.');
  }

  if (!isHashedTeamPin(context.opponent.pin)) {
    await operationsRepository.upgradePlayerPinHash(client, {
      teamId: context.opponent.id,
      pinHash: hashTeamPin(pin),
    });
  }

  await operationsRepository.attestPlayerScore(client, {
    teamId: session.teamId,
    scoreId,
    attestingTeamId: context.opponent.id,
  });
  return { success: true };
}

async function disputeScore(client, session, scoreId, reason) {
  await playerRepository.disputeScore(client, { scoreId, reason });
  return { success: true };
}

module.exports = {
  calculateAdvancedStats,
  submitLiveRound,
  attestOwnScore,
  disputeScore,
};
