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

async function getPlayerHomeAsync(client, teamId) {
  const dataBackend = require('../data/backend');
  const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const playerRepository = require('../data/supabase/playerRepository');
    try {
      const home = await playerRepository.getPlayerHome(client, teamId);
      return home;
    } catch {
      return null;
    }
  }

  const db = require('../database');
  const team = db.prepare(
    "SELECT id, name, current_handicap, league_id, course_id FROM teams WHERE id = ? AND status = 'active'"
  ).get(teamId);
  if (!team) return null;

  const league = db.prepare(
    "SELECT id, name, current_week, course_id FROM leagues WHERE id = ? AND status = 'active'"
  ).get(team.league_id);
  
  const course = league ? db.prepare('SELECT name FROM courses WHERE id = ?').get(league.course_id) : null;
  if (!league || !course || Number(team.course_id) !== Number(league.course_id)) return null;

  const { getLeagueStandings } = require('./standingsService');
  const standingsData = getLeagueStandings(db, team.league_id);
  const teamSeasonData = standingsData?.seasonStandings?.find(item => item.id === team.id) || null;

  const fixtureRow = db.prepare(`
    SELECT f.*, t1.name AS team1_name, t2.name AS team2_name,
      tt.starting_hole, tt.start_time
    FROM match_fixtures f
    LEFT JOIN teams t1 ON f.team1_id = t1.id
    LEFT JOIN teams t2 ON f.team2_id = t2.id
    LEFT JOIN tee_times tt ON tt.league_id = f.league_id
      AND tt.week_number = f.week_number
      AND (tt.team1_id = ? OR tt.team2_id = ?)
    WHERE f.league_id = ? AND f.week_number = ?
      AND (f.team1_id = ? OR f.team2_id = ?)
    ORDER BY f.id ASC LIMIT 1
  `).get(team.id, team.id, team.league_id, league.current_week, team.id, team.id);

  let opponentName = 'Not assigned';
  let fixture = null;
  let startingHole = null;

  if (fixtureRow) {
    fixture = fixtureRow;
    startingHole = fixtureRow.starting_hole;
    opponentName = (fixtureRow.team1_id === team.id ? fixtureRow.team2_name : fixtureRow.team1_name) || 'Open / Bye';
  }

  return {
    team,
    league,
    course,
    fixture,
    startingHole,
    opponentName,
    teamSeasonData
  };
}

async function getPlayerLiveScorecardAsync(client, teamId) {
  const dataBackend = require('../data/backend');
  const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const playerRepository = require('../data/supabase/playerRepository');
    try {
      const scorecard = await playerRepository.getPlayerLiveScorecard(client, teamId);
      return scorecard;
    } catch {
      return null;
    }
  }

  const db = require('../database');
  const team = db.prepare(`
    SELECT t.id,t.name,t.current_handicap,t.league_id,t.course_id,
      l.current_week,l.name AS league_name
    FROM teams t
    JOIN leagues l ON t.league_id = l.id AND t.course_id = l.course_id
    WHERE t.id = ? AND t.status = 'active' AND l.status = 'active'
  `).get(teamId);
  if (!team) return null;

  const match = db.prepare(`
    SELECT m.*
    FROM matches m
    JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
    WHERE m.league_id = ? AND m.week_number = ?
      AND (f.team1_id = ? OR f.team2_id = ?)
    ORDER BY f.id ASC LIMIT 1
  `).get(team.league_id, team.current_week, team.id, team.id);

  const courseHoles = db.prepare(`
    SELECT * FROM course_holes WHERE course_id = ? ORDER BY hole_number ASC
  `).all(team.course_id);

  let existingScore = null;
  let existingHoleDetails = {};

  if (match) {
    existingScore = db.prepare('SELECT * FROM scores WHERE match_id = ? AND team_id = ?').get(match.id, team.id);
    if (existingScore) {
      const details = db.prepare('SELECT * FROM score_hole_details WHERE score_id = ?').all(existingScore.id);
      existingHoleDetails = Object.fromEntries(details.map(item => [item.hole_number, item]));
    }
  }

  return { team, match, courseHoles, existingScore, existingHoleDetails };
}

module.exports = {
  getPlayerProfile,
  updatePlayerProfile,
  addClubToBag,
  deleteClubFromBag,
  saveRoundNote,
  awardBadge,
  getPlayerHomeAsync,
  getPlayerLiveScorecardAsync
};
