import db from '../../../lib/database';
import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import { getCourseDetails, getCourseWeather, getTeeTimes } from '../../../lib/services/courseService';
import CourseView from './CourseView';
import EmptyState from '../../../components/ui/EmptyState';
import dataBackend from '../../../lib/data/backend';
import courseRepository from '../../../lib/data/supabase/courseRepository';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export default async function CourseManagementPage() {
  const context = await getAdminContext();
  if (!context) {
    return (
      <EmptyState
        eyebrow="Secure area"
        title="Admin session required"
        description="Sign in to manage course information."
        primaryHref="/login"
        primaryLabel="Sign in"
      />
    );
  }

  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) {
    return (
      <EmptyState
        eyebrow="Restricted area"
        title="Course manager access required"
        description="Your role can support league scoring, but only a course owner or manager can change course, tee, and staff settings."
        primaryHref="/admin"
        primaryLabel="Back to overview"
      />
    );
  }

  if (!context.courseId) {
    return (
      <EmptyState
        title="Add your first course"
        description="Hole, tee, par, and location details form the foundation of league calculations. Once setup is complete, you can manage all course data here."
        primaryHref="/admin"
        primaryLabel="Back to setup"
        steps={['Course name and location', 'Hole par and handicap values', 'Tee sets and yardages']}
      />
    );
  }

  const activeDataBackend = resolveDataBackend();
  const supabase = activeDataBackend === DATA_BACKENDS.SUPABASE ? await createClient() : null;
  const courseDetails = supabase
    ? await courseRepository.getCourseManagementDetails(supabase, context.courseId)
    : getCourseDetails(db, context.courseId);
  if (!courseDetails) {
    return (
      <EmptyState
        title="Course details are not ready yet"
        description="No hole or tee information was found for this course. Complete the core details in course setup."
        primaryHref="/admin"
        primaryLabel="Back to setup"
      />
    );
  }

  const weather = getCourseWeather(courseDetails.course.weather_lat, courseDetails.course.weather_lon);
  const teeTimes = context.leagueId
    ? (supabase
        ? await courseRepository.getLeagueTeeTimes(supabase, {
            courseId: context.courseId,
            leagueId: context.leagueId,
            weekNumber: context.currentWeek,
          })
        : getTeeTimes(db, context.leagueId, context.currentWeek))
    : [];

  return (
    <CourseView
      courseDetails={courseDetails}
      weather={weather}
      teeTimes={teeTimes}
      currentWeek={context.currentWeek}
    />
  );
}
