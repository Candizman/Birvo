const playerRepository = require('../data/supabase/playerRepository');

/**
 * The player portal home: the team, its league and course, the current week's
 * fixture and opponent, and the team's season standing row.
 *
 * Returns null rather than throwing so a stale or revoked session lands on the
 * sign-in page instead of an error screen.
 */
async function getPlayerHome(client, teamId) {
  try {
    return await playerRepository.getPlayerHome(client, teamId);
  } catch {
    return null;
  }
}

/**
 * The live scorecard for the current round: the team, the open match, the hole
 * layout and any card already submitted. Null when there is nothing to score.
 */
async function getPlayerLiveScorecard(client, teamId) {
  try {
    return await playerRepository.getPlayerLiveScorecard(client, teamId);
  } catch {
    return null;
  }
}

async function getPlayerProfile(client, teamId) {
  return playerRepository.getPlayerProfile(client, teamId);
}

module.exports = {
  getPlayerHome,
  getPlayerLiveScorecard,
  getPlayerProfile,
};
