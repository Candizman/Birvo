const leagueRepository = require('../data/supabase/leagueRepository');
const treasuryRepository = require('../data/supabase/treasuryRepository');
const { summarizeDues } = require('../domain/treasury');

/**
 * Everything the treasury admin screen needs for one league: its dues and
 * skins-fee settings, every active team's dues status, and how much of the
 * season's dues have actually come in.
 */
async function getTreasuryView(client, { courseId, leagueId }) {
  const [league, teams] = await Promise.all([
    leagueRepository.getScopedLeague(client, { courseId, leagueId }),
    treasuryRepository.getTeamsForTreasuryView(client, leagueId),
  ]);
  if (!league) return null;

  return {
    league,
    teams,
    duesSummary: summarizeDues(teams, Number(league.dues_amount_cents) || 0),
  };
}

module.exports = { getTreasuryView };
