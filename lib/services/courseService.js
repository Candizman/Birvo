/**
 * Course presentation helpers.
 *
 * Course records are read through courseRepository and written through the
 * initialize_course_layout, update_course_profile, save_course_holes,
 * upsert_course_tee_box and delete_course_tee_box functions in PostgreSQL.
 * What remains here is the shaping that neither layer should own: deriving the
 * scorecard summary, and the weather placeholder.
 */

/**
 * Shapes a course, its holes, tees and staff into what the course screen renders,
 * including front nine / back nine / total par and the maintenance-hole count.
 */
function buildCourseDetails({ course, holes = [], teeBoxes = [], staff = [] }) {
  if (!course) return null;

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

/**
 * Placeholder conditions for the course screen. No weather provider is wired up
 * yet, so this returns a deterministic estimate flagged with isEstimate: true —
 * the UI shows it as an estimate rather than as observed weather.
 */
function getCourseWeather(lat = 36.5684, lon = -121.9507) {
  const hour = new Date().getHours();
  const isMorning = hour >= 6 && hour <= 12;
  const tempC = isMorning ? 18 : 22;

  return {
    isEstimate: true,
    source: 'birvo-placeholder',
    tempC,
    tempF: Math.round(tempC * 1.8 + 32),
    windMph: 9,
    windDirection: 'NW',
    humidity: '58%',
    condition: 'Sunny & Clear',
    golfIndex: 'Excellent (95% Playable)',
    icon: '☀️'
  };
}

module.exports = {
  buildCourseDetails,
  getCourseWeather
};
