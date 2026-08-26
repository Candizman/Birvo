'use strict';
function getWeatherForCourse(db, courseId) {
  const course = db.prepare('SELECT weather_lat, weather_lon FROM courses WHERE id = ?').get(courseId);
  if (!course || course.weather_lat == null || course.weather_lon == null) {
    return { available: false };
  }
  return {
    available: true,
    isPlaceholder: true,
    temperature: null,
    conditions: 'Weather data not connected',
    wind: null,
    humidity: null,
    courseLatitude: course.weather_lat,
    courseLongitude: course.weather_lon,
  };
}
module.exports = { getWeatherForCourse };
