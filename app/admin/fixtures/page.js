import db from '../../../lib/database';
import { getAdminContext } from '../../../lib/auth';
import { getLeagueFixtures, getSubstitutes, getRSVPs } from '../../../lib/services/fixtureService';
import { getTeeTimes } from '../../../lib/services/courseService';
import { getMissingScorecards } from '../../../lib/services/ghostManagementService';
import FixturesView from './FixturesView';
import dataBackend from '../../../lib/data/backend';
import leagueRepository from '../../../lib/data/supabase/leagueRepository';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export default async function FixturesAdminPage() {
  const context = await getAdminContext();
  if (!context || !context.leagueId) {
    return <div style={{ padding: '2rem', color: 'white' }}>Select or create a league to continue.</div>;
  }

  const activeDataBackend = resolveDataBackend();
  const usesSupabase = activeDataBackend === DATA_BACKENDS.SUPABASE;
  const snapshot = usesSupabase
    ? await leagueRepository.getFixtureManagementSnapshot(await createClient(), {
        courseId: context.courseId,
        leagueId: context.leagueId,
        weekNumber: context.currentWeek,
      })
    : null;
  const league = usesSupabase ? snapshot?.league : db.prepare('SELECT * FROM leagues WHERE id = ? AND course_id = ?').get(context.leagueId, context.courseId);
  const fixtures = usesSupabase ? snapshot?.fixtures || [] : getLeagueFixtures(db, context.leagueId);
  const substitutes = usesSupabase ? snapshot?.substitutes || [] : getSubstitutes(db, context.leagueId);
  const rsvps = usesSupabase ? snapshot?.rsvps || [] : getRSVPs(db, context.leagueId, context.currentWeek);
  const teeTimes = usesSupabase ? snapshot?.teeTimes || [] : getTeeTimes(db, context.leagueId, context.currentWeek);
  const courseHoles = usesSupabase ? snapshot?.courseHoles || [] : db.prepare(
    'SELECT hole_number, par, is_under_maintenance FROM course_holes WHERE course_id = ? ORDER BY hole_number'
  ).all(context.courseId);
  const teams = usesSupabase ? snapshot?.teams || [] : db.prepare(`
    SELECT t.id, t.name
    FROM teams t
    JOIN leagues l ON l.id = t.league_id
    WHERE t.league_id = ? AND l.course_id = ? AND t.status = 'active'
    ORDER BY t.name ASC
  `).all(context.leagueId, context.courseId);
  const missingTeams = usesSupabase ? snapshot?.missingTeams || [] : getMissingScorecards(db, {
    courseId: context.courseId,
    leagueId: context.leagueId,
    weekNumber: context.currentWeek,
  }).missingTeams;

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
