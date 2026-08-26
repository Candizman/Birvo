function getPlayerProfile(db, teamId) {
  const team = db.prepare('SELECT id, name, current_handicap, ghin_number, league_id FROM teams WHERE id = ?').get(teamId);
  if (!team) return null;

  const profile = db.prepare('SELECT * FROM player_profiles WHERE team_id = ?').get(teamId) || {
    id: null,
    team_id: teamId,
    bio: '',
    avatar_url: null,
    favorite_club: '',
    handicap_goal: 5,
    theme_preference: 'light',
    language: 'en-US',
    created_at: null
  };

  const badges = db.prepare('SELECT * FROM player_badges WHERE team_id = ? ORDER BY awarded_at DESC').all(teamId);
  const clubs = db.prepare('SELECT * FROM player_bag_clubs WHERE team_id = ? ORDER BY avg_distance_yards DESC').all(teamId);
  const roundNotes = db.prepare('SELECT * FROM round_notes WHERE team_id = ? ORDER BY week_number DESC').all(teamId);

  // History scores for trend chart
  const scores = db.prepare(`
    SELECT s.gross_score, s.net_score, m.week_number, s.created_at
    FROM scores s
    JOIN matches m ON s.match_id = m.id
    WHERE s.team_id = ?
    ORDER BY m.week_number ASC
  `).all(teamId);

  return {
    team,
    profile,
    badges,
    clubs,
    roundNotes,
    scores
  };
}

function updatePlayerProfile(db, teamId, { bio, favoriteClub, handicapGoal, themePreference, language }) {
  return db.prepare(`
    INSERT INTO player_profiles (
      team_id, bio, favorite_club, handicap_goal, theme_preference, language
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(team_id) DO UPDATE SET
      bio = COALESCE(excluded.bio, player_profiles.bio),
      favorite_club = COALESCE(excluded.favorite_club, player_profiles.favorite_club),
      handicap_goal = COALESCE(excluded.handicap_goal, player_profiles.handicap_goal),
      theme_preference = COALESCE(excluded.theme_preference, player_profiles.theme_preference),
      language = COALESCE(excluded.language, player_profiles.language)
  `).run(teamId, bio ?? null, favoriteClub ?? null, handicapGoal ?? null, themePreference ?? null, language ?? null);
}

function addClubToBag(db, teamId, { clubName, brand, avgDistanceYards }) {
  return db.prepare(`
    INSERT INTO player_bag_clubs (team_id, club_name, brand, avg_distance_yards)
    VALUES (?, ?, ?, ?)
  `).run(teamId, clubName, brand || '', avgDistanceYards || 150);
}

function deleteClubFromBag(db, teamId, clubId) {
  return db.prepare('DELETE FROM player_bag_clubs WHERE id = ? AND team_id = ?').run(clubId, teamId);
}

function saveRoundNote(db, teamId, weekNumber, notes) {
  return db.prepare(`
    INSERT INTO round_notes (team_id, week_number, notes)
    VALUES (?, ?, ?)
  `).run(teamId, weekNumber, notes);
}

function awardBadge(db, teamId, badgeKey, badgeTitle, badgeIcon) {
  return db.prepare(`
    INSERT INTO player_badges (team_id, badge_key, badge_title, badge_icon)
    VALUES (?, ?, ?, ?)
  `).run(teamId, badgeKey, badgeTitle, badgeIcon);
}

module.exports = {
  getPlayerProfile,
  updatePlayerProfile,
  addClubToBag,
  deleteClubFromBag,
  saveRoundNote,
  awardBadge
};
