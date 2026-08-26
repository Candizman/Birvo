/**
 * Generates a round-robin schedule from a team list.
 * Adds a bye when the number of teams is odd.
 * @param {Array} teams - Teams in the league
 * @returns {Array} matches - Matchups grouped by week
 */
export function generateRoundRobin(teams) {
  if (teams.length < 2) return [];

  const teamIds = teams.map(t => t.id);
  // Add a placeholder bye team when the team count is odd.
  if (teamIds.length % 2 !== 0) {
    teamIds.push(null);
  }

  const numWeeks = teamIds.length - 1;
  const half = teamIds.length / 2;
  const matches = [];

  const tempIds = [...teamIds];
  tempIds.shift(); // Keep the first team fixed.

  for (let week = 1; week <= numWeeks; week++) {
    const weekMatches = [];

    // Pair the first team with the final team in the rotating list.
    if (teamIds[0] !== null && tempIds[tempIds.length - 1] !== null) {
        weekMatches.push({
            week,
            team1: teamIds[0],
            team2: tempIds[tempIds.length - 1]
        });
    }

    for (let i = 0; i < half - 1; i++) {
        if (tempIds[i] !== null && tempIds[tempIds.length - 2 - i] !== null) {
            weekMatches.push({
                week,
                team1: tempIds[i],
                team2: tempIds[tempIds.length - 2 - i]
            });
        }
    }
    matches.push(...weekMatches);

    // Rotate the array for the next round-robin pairing.
    tempIds.unshift(tempIds.pop());
  }

  return matches;
}
