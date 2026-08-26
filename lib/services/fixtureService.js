const { writeAuditEvent } = require('./auditService');

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

function generateAndSaveFixtures(db, leagueId, totalWeeks = 10, doubleRound = false, auditContext = null) {
  return db.transaction(() => {
    const league = auditContext?.courseId == null
      ? db.prepare("SELECT id,current_week FROM leagues WHERE id=? AND status='active'").get(leagueId)
      : db.prepare("SELECT id,current_week FROM leagues WHERE id=? AND course_id=? AND status='active'").get(leagueId, auditContext.courseId);
    if (!league || league.current_week !== 1) throw new Error('Fixtures can be regenerated only before the season advances.');
    const scoreCount = db.prepare('SELECT COUNT(*) AS count FROM scores s JOIN matches m ON m.id=s.match_id WHERE m.league_id=?').get(leagueId).count;
    if (scoreCount > 0) throw new Error('Fixtures cannot be regenerated after score entry begins.');
    // Clean old fixtures for this league
    const teams = db.prepare("SELECT id, name FROM teams WHERE league_id = ? AND status = 'active' ORDER BY id ASC").all(leagueId);
    if (teams.length < 2) throw new Error('At least two active teams are required.');
    const matchups = generateRoundRobinMatchups(teams, totalWeeks, doubleRound);
    db.prepare('DELETE FROM match_fixtures WHERE league_id = ?').run(leagueId);

    const insert = db.prepare(`
      INSERT INTO match_fixtures (league_id, week_number, team1_id, team2_id, is_bye, scheduled_time)
      VALUES (?, ?, ?, ?, ?, '09:00')
    `);

    for (const m of matchups) {
      insert.run(leagueId, m.week_number, m.team1_id, m.team2_id, m.is_bye);
    }
    const leagueColumns = db.pragma('table_info(leagues)').map(column => column.name);
    if (leagueColumns.includes('season_length_weeks')) {
      db.prepare('UPDATE leagues SET season_length_weeks=? WHERE id=?').run(totalWeeks, leagueId);
    }
    if (auditContext?.courseId != null) {
      writeAuditEvent(db, {
        courseId: auditContext.courseId,
        actorUserId: auditContext.actorUserId,
        action: 'league.fixtures.replaced',
        targetType: 'league',
        targetId: leagueId,
        metadata: { weeks: totalWeeks, doubleRound: Boolean(doubleRound), fixtures: matchups.length },
      });
    }
    return { fixtureCount: matchups.length };
  })();
}

function getLeagueFixtures(db, leagueId) {
  return db.prepare(`
    SELECT
      mf.*,
      t1.name as team1_name,
      t2.name as team2_name
    FROM match_fixtures mf
    LEFT JOIN teams t1 ON mf.team1_id = t1.id
    LEFT JOIN teams t2 ON mf.team2_id = t2.id
    WHERE mf.league_id = ?
    ORDER BY mf.week_number ASC, mf.id ASC
  `).all(leagueId);
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

function generateICalCalendar(db, leagueId) {
  const league = db.prepare('SELECT id,name FROM leagues WHERE id = ?').get(leagueId);
  return buildICalCalendar({ league, fixtures: getLeagueFixtures(db, leagueId) });
}

function getSubstitutes(db, leagueId) {
  return db.prepare('SELECT * FROM substitutes WHERE league_id = ? ORDER BY name ASC').all(leagueId);
}

function saveSubstitute(db, leagueId, data) {
  const { name, handicap = 0.0, phone = '', email = '' } = data;
  return db.prepare(`
    INSERT INTO substitutes (league_id, name, handicap, phone, email, status)
    VALUES (?, ?, ?, ?, ?, 'available')
  `).run(leagueId, name, handicap, phone, email);
}

function addLeagueSubstitute(db, { courseId, leagueId, actorUserId, data }) {
  return db.transaction(() => {
    const league = db.prepare("SELECT id FROM leagues WHERE id=? AND course_id=? AND status='active'").get(leagueId, courseId);
    if (!league) throw new Error('Active league not found.');
    const result = saveSubstitute(db, leagueId, data);
    writeAuditEvent(db, {
      courseId,
      actorUserId,
      action: 'league.substitute.added',
      targetType: 'substitute',
      targetId: result.lastInsertRowid,
      metadata: { leagueId },
    });
    return { id: Number(result.lastInsertRowid) };
  })();
}

function getRSVPs(db, leagueId, weekNumber) {
  return db.prepare(`
    SELECT
      pr.*,
      t.name as team_name
    FROM player_rsvps pr
    JOIN teams t ON pr.team_id = t.id
    WHERE t.league_id = ? AND pr.week_number = ?
    ORDER BY t.name ASC
  `).all(leagueId, weekNumber).map(item => ({ ...item, status: normalizeRSVPStatus(item.status) }));
}

function saveRSVP(db, teamId, weekNumber, status, note = '') {
  const normalizedStatus = normalizeRSVPStatus(status);
  return db.prepare(`
    INSERT INTO player_rsvps (team_id, week_number, status, note)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(team_id, week_number) DO UPDATE SET
      status = excluded.status,
      note = excluded.note,
      created_at = CURRENT_TIMESTAMP
  `).run(teamId, weekNumber, normalizedStatus, note);
}

function saveLeagueTeamRSVP(db, { courseId, leagueId, teamId, weekNumber, status, note = '', actorUserId }) {
  return db.transaction(() => {
    const team = db.prepare(`
      SELECT t.id
      FROM teams t
      JOIN leagues l ON l.id = t.league_id
      WHERE t.id = ? AND t.league_id = ? AND l.course_id = ?
        AND t.status = 'active' AND l.status = 'active' AND l.current_week = ?
    `).get(teamId, leagueId, courseId, weekNumber);
    if (!team) throw new Error('The team or current RSVP week is no longer available.');
    saveRSVP(db, teamId, weekNumber, status, note);
    const rsvp = db.prepare('SELECT id FROM player_rsvps WHERE team_id=? AND week_number=?').get(teamId, weekNumber);
    writeAuditEvent(db, {
      courseId,
      actorUserId,
      action: 'league.rsvp.saved',
      targetType: 'player_rsvp',
      targetId: rsvp.id,
      metadata: { leagueId, teamId, weekNumber, status: normalizeRSVPStatus(status) },
    });
    return { id: rsvp.id };
  })();
}

function normalizeRSVPStatus(status) {
  const aliases = {
    yes: 'attending',
    confirmed: 'attending',
    no: 'not_attending',
    declined: 'not_attending',
  };
  return aliases[status] || status;
}

module.exports = {
  generateRoundRobinMatchups,
  buildICalCalendar,
  generateAndSaveFixtures,
  getLeagueFixtures,
  generateICalCalendar,
  getSubstitutes,
  normalizeRSVPStatus,
  saveSubstitute,
  addLeagueSubstitute,
  getRSVPs,
  saveRSVP,
  saveLeagueTeamRSVP,
};
