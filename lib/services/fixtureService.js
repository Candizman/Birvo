const leagueRepository = require('../data/supabase/leagueRepository');

function generateRoundRobinMatchups(teams, totalWeeks = 10, doubleRound = false) {
  if (!teams || teams.length < 2) return [];

  const teamList = [...teams];
  // If odd, add a dummy Bye team
  if (teamList.length % 2 !== 0) {
    teamList.push({ id: null, name: 'Bye (Ghost Team)', isBye: true });
  }

  const n = teamList.length;
  const half = n / 2;
  const numRounds = n - 1;
  const fixtures = [];

  const rotating = teamList.slice(1);
  const fixed = teamList[0];

  let currentWeek = 1;
  const maxCycles = Math.ceil(totalWeeks / numRounds);

  for (let cycle = 0; cycle < maxCycles && currentWeek <= totalWeeks; cycle++) {
    for (let round = 0; round < numRounds && currentWeek <= totalWeeks; round++) {
      const roundTeams = [fixed, ...rotating];

      for (let i = 0; i < half; i++) {
        const t1 = roundTeams[i];
        const t2 = roundTeams[n - 1 - i];

        const isBye = !t1.id || !t2.id;
        const reversePairing = doubleRound && cycle % 2 === 1 && !isBye;
        fixtures.push({
          week_number: currentWeek,
          team1_id: reversePairing ? t2.id : (t1.id || t2.id),
          team2_id: isBye ? null : (reversePairing ? t1.id : (t1.id ? t2.id : t1.id)),
          is_bye: isBye ? 1 : 0
        });
      }

      currentWeek++;
      // Rotate array
      rotating.unshift(rotating.pop());
    }
  }

  return fixtures;
}


function escapeICalText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildICalCalendar({ league, fixtures, generatedAt = new Date() }) {
  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Birvo//League Fixtures//EN',
    `X-WR-CALNAME:${escapeICalText(league?.name || 'Birvo')} Schedule`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  const now = generatedAt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  fixtures.forEach((f, idx) => {
    const summary = f.is_bye ? `${f.team1_name} (Bye)` : `${f.team1_name} vs ${f.team2_name}`;
    ics.push(
      'BEGIN:VEVENT',
      `UID:birvo-${league?.id || 'league'}-${f.id}-${idx}@birvo.com`,
      `DTSTAMP:${now}`,
      `SUMMARY:Week ${f.week_number}: ${escapeICalText(summary)}`,
      `DESCRIPTION:${escapeICalText(league?.name)} week ${f.week_number} matchup`,
      'STATUS:CONFIRMED',
      'END:VEVENT'
    );
  });

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}



/**
 * Everything the fixtures screen needs for one week: the league, its fixtures,
 * substitutes, RSVPs, tee times, hole layout, active teams, and which teams have
 * not turned in a card yet.
 */
async function getFixtureManagementSnapshot(client, context) {
  return leagueRepository.getFixtureManagementSnapshot(client, context);
}

module.exports = {
  generateRoundRobinMatchups,
  buildICalCalendar,
  getFixtureManagementSnapshot,
};
