const SETUP_STEPS = Object.freeze([
  { key: 'course_profile', label: 'Course profile', href: '/admin/course', description: 'Name, location, timezone, and contact details' },
  { key: 'course_layout', label: 'Hole layout', href: '/admin/course', description: 'A complete 9- or 18-hole par and stroke-index layout' },
  { key: 'tee_boxes', label: 'Tee ratings', href: '/admin/course', description: 'At least one tee with course and slope ratings' },
  { key: 'first_league', label: 'League rules', href: '/admin/leagues', description: 'An active league with a defined season' },
  { key: 'roster', label: 'Roster', href: '/admin/leagues', description: 'At least two active teams' },
  { key: 'scoring_ready', label: 'First round', href: '/admin/fixtures', description: 'A scheduled match week ready for score entry' },
]);

function buildCourseSetupProgress({ course, league = null, holes = [], teeBoxes = [], teams = [], matches = [] }) {
  if (!course) {
    const steps = SETUP_STEPS.map(step => ({ ...step, complete: false }));
    return { steps, completedCount: 0, readyForScoring: false, blockers: steps };
  }

  const distinctStrokeIndexes = new Set(
    holes
      .map(hole => Number(hole.stroke_index))
      .filter(strokeIndex => Number.isInteger(strokeIndex) && strokeIndex > 0)
  );
  const activeTeams = teams.filter(team => !team.status || team.status === 'active');
  const playableMatches = matches.filter(match => !['cancelled', 'rained_out'].includes(match.status));
  const profileComplete = Boolean(course.name?.trim() && course.city?.trim() && course.state?.trim() && course.postal_code?.trim() && course.timezone?.trim());
  const layoutComplete = [9, 18].includes(holes.length) && distinctStrokeIndexes.size === holes.length;
  const status = {
    course_profile: profileComplete,
    course_layout: layoutComplete,
    tee_boxes: teeBoxes.length > 0,
    first_league: Boolean(league && league.season_length_weeks > 0),
    roster: activeTeams.length >= 2,
    scoring_ready: playableMatches.length > 0,
  };
  const steps = SETUP_STEPS.map(step => ({ ...step, complete: status[step.key] }));
  return {
    steps,
    completedCount: steps.filter(step => step.complete).length,
    readyForScoring: layoutComplete && teeBoxes.length > 0 && Boolean(league) && activeTeams.length >= 2 && playableMatches.length > 0,
    blockers: steps.filter(step => !step.complete),
  };
}

async function getScoringWorkspace(client, context) {
  const workspaceRepository = require('../data/supabase/workspaceRepository');
  return workspaceRepository.getScoringWorkspace(client, context);
}

module.exports = { SETUP_STEPS, buildCourseSetupProgress, getScoringWorkspace };
