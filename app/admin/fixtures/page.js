import { getAdminContext } from '../../../lib/auth';
import FixturesView from './FixturesView';
import { createClient } from '../../../lib/supabase/server';
import { getFixtureManagementSnapshot } from '../../../lib/services/fixtureService';

export default async function FixturesAdminPage() {
  const context = await getAdminContext();
  if (!context || !context.leagueId) {
    return <div style={{ padding: '2rem', color: 'white' }}>Select or create a league to continue.</div>;
  }

  const snapshot = await getFixtureManagementSnapshot(await createClient(), {
    courseId: context.courseId,
    leagueId: context.leagueId,
    weekNumber: context.currentWeek,
  });

  const {
    league, fixtures, substitutes, rsvps, teeTimes, courseHoles, teams, missingTeams
  } = snapshot;

  return (
    <FixturesView
      league={league}
      fixtures={fixtures}
      substitutes={substitutes}
      rsvps={rsvps}
      teeTimes={teeTimes}
      courseHoles={courseHoles}
      teams={teams}
      teamCount={teams.length}
      currentWeek={context.currentWeek}
      missingTeams={missingTeams}
    />
  );
}
