import { NextResponse } from 'next/server';
import db from '../../../../lib/database';
import { buildICalCalendar, generateICalCalendar } from '../../../../lib/services/fixtureService';
import { getAdminContext } from '../../../../lib/auth';
import dataBackend from '../../../../lib/data/backend';
import leagueRepository from '../../../../lib/data/supabase/leagueRepository';
import { createClient } from '../../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export async function GET(request, { params }) {
  const { leagueId } = await params;
  const context = await getAdminContext();

  if (!context?.courseId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const selectedLeague = context.allLeagues.find(league => String(league.id) === String(leagueId));
  if (!selectedLeague) {
    return NextResponse.json({ error: 'Invalid League ID' }, { status: 400 });
  }
  const activeDataBackend = resolveDataBackend();
  let icsData;
  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    const calendar = await leagueRepository.getLeagueCalendarData(await createClient(), {
      courseId: context.courseId,
      leagueId: selectedLeague.id,
    });
    if (!calendar) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    icsData = buildICalCalendar(calendar);
  } else {
    const league = db.prepare('SELECT id FROM leagues WHERE id = ? AND course_id = ?').get(selectedLeague.id, context.courseId);
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    icsData = generateICalCalendar(db, selectedLeague.id);
  }

  return new Response(icsData, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="birvo-league-${selectedLeague.id}.ics"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
