const operationsRepository = require('../data/supabase/operationsRepository');

/**
 * Submits a player's own total gross score. Round assignment, lock state, course
 * setup readiness and the handicap recalculation are all enforced inside the
 * submit_player_gross_score function in PostgreSQL.
 */
async function submitPlayerGrossScore(client, teamId, grossScore) {
  return operationsRepository.submitPlayerGrossScore(client, { teamId, grossScore });
}

module.exports = { submitPlayerGrossScore };
