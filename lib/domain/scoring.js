// What a round is ranked on. Net score for stroke play, and whatever the
// league's format supplies otherwise -- stableford negates its points total so
// that the highest score still sorts first here.
function rankValueOf(team) {
  return team.rankValue !== undefined && team.rankValue !== null ? team.rankValue : team.netScore;
}

function calculateLeaguePoints(teamsWithNet, totalActiveTeams) {
  if (teamsWithNet.length < totalActiveTeams || totalActiveTeams === 0) {
    return [...teamsWithNet].sort((a, b) => rankValueOf(a) - rankValueOf(b)).map(t => ({
      ...t,
      pointsEarned: 0,
      rank: '-'
    }));
  }

  const sorted = [...teamsWithNet].sort((a, b) => rankValueOf(a) - rankValueOf(b));
  const groups = {};
  sorted.forEach(team => {
    const key = rankValueOf(team);
    if (!groups[key]) groups[key] = [];
    groups[key].push(team);
  });

  let currentAvailablePoint = totalActiveTeams;
  const results = [];
  let currentRank = 1;

  const uniqueScores = Object.keys(groups).map(Number).sort((a, b) => a - b);

  uniqueScores.forEach(score => {
    const tiedTeams = groups[score];
    const numTied = tiedTeams.length;
    let pointsSum = 0;
    for (let i = 0; i < numTied; i++) {
      pointsSum += currentAvailablePoint;
      currentAvailablePoint--;
    }
    const avgPoint = pointsSum / numTied;
    tiedTeams.forEach(team => {
      results.push({ ...team, pointsEarned: avgPoint, rank: currentRank });
    });
    currentRank += numTied;
  });

  return results;
}

function calculateSeasonStandings(teams, weeklyResultsList) {
  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.id] = {
      id: team.id,
      name: team.name,
      currentHandicap: team.current_handicap,
      totalPoints: 0,
      weeksPlayed: 0,
      totalGross: 0,
      totalNet: 0,
      weeklyScores: {},
      ghostRounds: 0,
      bestRank: null
    };
  });

  weeklyResultsList.forEach(({ weekNumber, results }) => {
    results.forEach(res => {
      if (teamMap[res.id]) {
        const gross = res.currentGross !== undefined ? res.currentGross : (res.grossScore || 0);
        const net = res.netScore !== undefined ? res.netScore : 0;
        const pts = res.pointsEarned !== undefined ? res.pointsEarned : 0;

        teamMap[res.id].totalPoints += pts;
        teamMap[res.id].weeksPlayed += 1;
        teamMap[res.id].totalGross += gross;
        teamMap[res.id].totalNet += net;
        teamMap[res.id].weeklyScores[weekNumber] = {
          grossScore: gross,
          handicap: res.handicap,
          netScore: net,
          pointsEarned: pts,
          rank: res.rank,
          isGhost: Boolean(res.isGhost)
        };
        if (res.isGhost) teamMap[res.id].ghostRounds += 1;
        if (typeof res.rank === 'number') {
          if (teamMap[res.id].bestRank === null || res.rank < teamMap[res.id].bestRank) {
            teamMap[res.id].bestRank = res.rank;
          }
        }
      }
    });
  });

  const teamList = Object.values(teamMap).map(t => ({
    ...t,
    avgGross: t.weeksPlayed > 0 ? Number((t.totalGross / t.weeksPlayed).toFixed(1)) : null,
    avgNet: t.weeksPlayed > 0 ? Number((t.totalNet / t.weeksPlayed).toFixed(1)) : null,
    totalPoints: Number(t.totalPoints.toFixed(1))
  }));

  // Sort by totalPoints DESC, then avgNet ASC
  teamList.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    const aNet = a.avgNet !== null ? a.avgNet : 999;
    const bNet = b.avgNet !== null ? b.avgNet : 999;
    return aNet - bNet;
  });

  // Assign overall season rank
  for (let i = 0; i < teamList.length; i++) {
    if (i > 0 && teamList[i].totalPoints === teamList[i - 1].totalPoints && teamList[i].avgNet === teamList[i - 1].avgNet) {
      teamList[i].seasonRank = teamList[i - 1].seasonRank;
    } else {
      teamList[i].seasonRank = i + 1;
    }
  }

  return teamList;
}

module.exports = { calculateLeaguePoints, calculateSeasonStandings };
