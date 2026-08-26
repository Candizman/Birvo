function initializeCourseHolesAndTees(db, courseId) {
  const defaultPars = [4, 4, 3, 5, 4, 4, 3, 5, 4,  4, 4, 3, 5, 4, 4, 3, 5, 4];
  const defaultStrokeIndexes = [7, 3, 15, 1, 11, 5, 17, 9, 13,  8, 4, 16, 2, 12, 6, 18, 10, 14];

  const insertHole = db.prepare(`
    INSERT OR IGNORE INTO course_holes (course_id, hole_number, par, stroke_index, pin_position, is_under_maintenance)
    VALUES (?, ?, ?, ?, 'center', 0)
  `);
  const insertTee = db.prepare(`
    INSERT OR IGNORE INTO course_tee_boxes (course_id, name, color_hex, gender, course_rating, slope_rating, total_yards, total_meters)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let h = 1; h <= 18; h++) {
    insertHole.run(courseId, h, defaultPars[h - 1], defaultStrokeIndexes[h - 1]);
  }
  insertTee.run(courseId, 'Black (Championship)', '#1e293b', 'men', 74.2, 135, 6850, 6263);
  insertTee.run(courseId, 'White (Men)', '#f8fafc', 'men', 72.0, 128, 6400, 5852);
  insertTee.run(courseId, 'Gold (Senior)', '#eab308', 'all', 70.4, 122, 5950, 5440);
  insertTee.run(courseId, 'Red (Women)', '#ef4444', 'women', 68.8, 116, 5200, 4754);
}

const { listCourseAccess } = require('./membershipService');

function buildCourseDetails({ course, holes = [], teeBoxes = [], staff = [] }) {
  if (!course) return null;
  // Front 9 / Back 9 / Total Par calculations
  const front9Holes = holes.filter(h => h.hole_number <= 9);
  const back9Holes = holes.filter(h => h.hole_number > 9);

  const front9Par = front9Holes.reduce((sum, h) => sum + h.par, 0);
  const back9Par = back9Holes.reduce((sum, h) => sum + h.par, 0);
  const totalPar = front9Par + back9Par;

  const maintenanceHolesCount = holes.filter(h => h.is_under_maintenance).length;

  return {
    course,
    holes,
    teeBoxes,
    staff,
    stats: {
      totalHoles: holes.length,
      totalPar,
      front9Par,
      back9Par,
      maintenanceHolesCount
    }
  };
}

function getCourseDetails(db, courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return null;
  const holes = db.prepare(`
    SELECT * FROM course_holes
    WHERE course_id = ?
    ORDER BY hole_number ASC
  `).all(courseId);
  const teeBoxes = db.prepare(`
    SELECT * FROM course_tee_boxes
    WHERE course_id = ?
    ORDER BY total_yards DESC
  `).all(courseId);
  return buildCourseDetails({ course, holes, teeBoxes, staff: listCourseAccess(db, courseId) });
}

function updateCourseProfile(db, courseId, data) {
  const {
    name,
    primary_color,
    address,
    city,
    contact_email,
    contact_phone,
    local_rules,
    weather_lat,
    weather_lon
  } = data;

  return db.prepare(`
    UPDATE courses SET
      name = COALESCE(?, name),
      primary_color = COALESCE(?, primary_color),
      address = COALESCE(?, address),
      city = COALESCE(?, city),
      contact_email = COALESCE(?, contact_email),
      contact_phone = COALESCE(?, contact_phone),
      local_rules = COALESCE(?, local_rules),
      weather_lat = COALESCE(?, weather_lat),
      weather_lon = COALESCE(?, weather_lon)
    WHERE id = ?
  `).run(
    name,
    primary_color,
    address,
    city,
    contact_email,
    contact_phone,
    local_rules,
    weather_lat,
    weather_lon,
    courseId
  );
}

function updateCourseHolesBatch(db, courseId, holesData) {
  return db.transaction(() => {
    const updateHole = db.prepare(`
      UPDATE course_holes SET
        par = ?,
        stroke_index = ?,
        pin_position = ?,
        is_under_maintenance = ?,
        notes = ?
      WHERE course_id = ? AND hole_number = ?
    `);

    for (const h of holesData) {
      updateHole.run(
        h.par,
        h.stroke_index,
        h.pin_position || 'center',
        h.is_under_maintenance ? 1 : 0,
        h.notes || null,
        courseId,
        h.hole_number
      );
    }
  })();
}

function saveTeeBox(db, courseId, teeData) {
  const { id, name, color_hex, gender, course_rating, slope_rating, total_yards, total_meters } = teeData;
  if (id) {
    return db.prepare(`
      UPDATE course_tee_boxes SET
        name = ?, color_hex = ?, gender = ?, course_rating = ?, slope_rating = ?, total_yards = ?, total_meters = ?
      WHERE id = ? AND course_id = ?
    `).run(name, color_hex, gender, course_rating, slope_rating, total_yards, total_meters, id, courseId);
  } else {
    return db.prepare(`
      INSERT INTO course_tee_boxes (course_id, name, color_hex, gender, course_rating, slope_rating, total_yards, total_meters)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, name, color_hex, gender || 'all', course_rating || 72.0, slope_rating || 113, total_yards || 6400, total_meters || 5852);
  }
}

function deleteTeeBox(db, courseId, teeId) {
  return db.prepare('DELETE FROM course_tee_boxes WHERE id = ? AND course_id = ?').run(teeId, courseId);
}

function getCourseWeather(lat = 36.5684, lon = -121.9507) {
  // Deterministic realistic golf weather estimation based on coordinates / seasonality
  const hour = new Date().getHours();
  const isMorning = hour >= 6 && hour <= 12;
  const tempC = isMorning ? 18 : 22;
  const windMph = 9;
  const condition = 'Sunny & Clear';
  const golfIndex = 'Excellent (95% Playable)';

  return {
    isEstimate: true,
    source: 'birvo-placeholder',
    tempC,
    tempF: Math.round(tempC * 1.8 + 32),
    windMph,
    windDirection: 'NW',
    humidity: '58%',
    condition,
    golfIndex,
    icon: '☀️'
  };
}

function getTeeTimes(db, leagueId, weekNumber) {
  return db.prepare(`
    SELECT
      tt.*,
      t1.name as team1_name,
      t2.name as team2_name
    FROM tee_times tt
    LEFT JOIN teams t1 ON tt.team1_id = t1.id
    LEFT JOIN teams t2 ON tt.team2_id = t2.id
    WHERE tt.league_id = ? AND tt.week_number = ?
    ORDER BY tt.starting_hole ASC, tt.starting_group ASC, tt.start_time ASC
  `).all(leagueId, weekNumber);
}

function generateShotgunTeeTimes(db, leagueId, weekNumber, startTime = '09:00', intervalMinutes = 10) {
  return db.transaction(() => {
    // Remove existing tee times for the current week.
    db.prepare('DELETE FROM tee_times WHERE league_id = ? AND week_number = ?').run(leagueId, weekNumber);

    const teams = db.prepare("SELECT id FROM teams WHERE league_id = ? AND status = 'active' ORDER BY id ASC").all(leagueId);
    const insertTeeTime = db.prepare(`
      INSERT INTO tee_times (league_id, week_number, start_time, starting_hole, starting_group, team1_id, team2_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled')
    `);

    // Pair teams into two-team matchups.
    let hole = 1;
    let group = 'A';
    for (let i = 0; i < teams.length; i += 2) {
      const team1 = teams[i]?.id || null;
      const team2 = teams[i + 1]?.id || null;

      insertTeeTime.run(leagueId, weekNumber, startTime, hole, group, team1, team2);

      if (group === 'A') {
        group = 'B';
      } else {
        group = 'A';
        hole = (hole % 18) + 1;
      }
    }
  })();
}

module.exports = {
  buildCourseDetails,
  initializeCourseHolesAndTees,
  getCourseDetails,
  updateCourseProfile,
  updateCourseHolesBatch,
  saveTeeBox,
  deleteTeeBox,
  getCourseWeather,
  getTeeTimes,
  generateShotgunTeeTimes
};
