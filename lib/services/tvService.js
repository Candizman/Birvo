const { getLeagueStandings } = require('./standingsService');
const { getCourseWeather } = require('./courseService');
const { writeAuditEvent } = require('./auditService');

function getTVDisplayData(db, leagueId) {
  const league = db.prepare('SELECT l.*, c.name as course_name, c.city as course_city, c.weather_lat, c.weather_lon FROM leagues l JOIN courses c ON l.course_id = c.id WHERE l.id = ?').get(leagueId);
  if (!league) return null;

  const display = db.prepare('SELECT * FROM tv_displays WHERE league_id = ?').get(leagueId) || {
    league_id: leagueId,
    name: 'Birvo TV',
    template_type: 'leaderboard_ticker',
    auto_scroll_speed: 8,
    announcement_text: null,
    celebration_effects: 0,
    sound_enabled: 0
  };

  const sponsors = db.prepare('SELECT * FROM tv_sponsors WHERE league_id = ? AND active = 1 ORDER BY display_order ASC').all(leagueId);
  const standingsData = getLeagueStandings(db, leagueId);
  const weather = getCourseWeather(league.weather_lat, league.weather_lon);

  return {
    league,
    display,
    sponsors,
    standings: standingsData?.seasonStandings || [],
    weeklyResults: standingsData?.weeklyResultsList || [],
    currentWeek: league.current_week,
    weather
  };
}

function requireManagedLeague(db, courseId, leagueId) {
  const league = db.prepare("SELECT id FROM leagues WHERE id=? AND course_id=? AND status='active'").get(leagueId, courseId);
  if (!league) throw new Error('Active league not found.');
  return league;
}

function saveTVDisplaySettings(db, {
  courseId, leagueId, actorUserId, templateType, autoScrollSpeed, showAnnouncements,
  announcementText, celebrationEffects, soundEnabled,
}) {
  return db.transaction(() => {
    requireManagedLeague(db, courseId, leagueId);
    let display = db.prepare('SELECT id FROM tv_displays WHERE league_id=? ORDER BY id LIMIT 1').get(leagueId);
    if (!display) {
      const inserted = db.prepare(`
        INSERT INTO tv_displays (league_id,name,template_type,auto_scroll_speed)
        VALUES (?, 'Clubhouse Main Screen', 'leaderboard_ticker', 8)
      `).run(leagueId);
      display = { id: Number(inserted.lastInsertRowid) };
    }
    db.prepare(`
      UPDATE tv_displays SET
        template_type=?,auto_scroll_speed=?,show_announcements=?,announcement_text=?,
        celebration_effects=?,sound_enabled=?
      WHERE id=? AND league_id=?
    `).run(templateType, autoScrollSpeed, showAnnouncements ? 1 : 0, announcementText || null,
      celebrationEffects ? 1 : 0, soundEnabled ? 1 : 0, display.id, leagueId);
    writeAuditEvent(db, {
      courseId, actorUserId, action: 'publishing.tv.updated', targetType: 'tv_display', targetId: display.id,
      metadata: { leagueId, templateType, autoScrollSpeed, showAnnouncements: Boolean(showAnnouncements) },
    });
    return { id: display.id };
  })();
}

function addTVSponsor(db, { courseId, leagueId, actorUserId, name, logoUrl, displayOrder }) {
  return db.transaction(() => {
    requireManagedLeague(db, courseId, leagueId);
    const result = db.prepare(`
      INSERT INTO tv_sponsors (league_id,name,logo_url,display_order,active)
      VALUES (?, ?, ?, ?, 1)
    `).run(leagueId, name, logoUrl || null, displayOrder);
    const sponsorId = Number(result.lastInsertRowid);
    writeAuditEvent(db, {
      courseId, actorUserId, action: 'publishing.sponsor.added', targetType: 'tv_sponsor', targetId: sponsorId,
      metadata: { leagueId, name, displayOrder },
    });
    return { id: sponsorId };
  })();
}

function deleteTVSponsor(db, { courseId, leagueId, actorUserId, sponsorId }) {
  return db.transaction(() => {
    requireManagedLeague(db, courseId, leagueId);
    const sponsor = db.prepare('SELECT id,name FROM tv_sponsors WHERE id=? AND league_id=?').get(sponsorId, leagueId);
    if (!sponsor) throw new Error('Sponsor not found.');
    db.prepare('DELETE FROM tv_sponsors WHERE id=? AND league_id=?').run(sponsorId, leagueId);
    writeAuditEvent(db, {
      courseId, actorUserId, action: 'publishing.sponsor.deleted', targetType: 'tv_sponsor', targetId: sponsorId,
      metadata: { leagueId, name: sponsor.name },
    });
    return { success: true };
  })();
}

module.exports = {
  getTVDisplayData,
  saveTVDisplaySettings,
  addTVSponsor,
  deleteTVSponsor
};
