import { NextResponse } from 'next/server';
import { buildICalCalendar } from '../../../../lib/services/fixtureService';
import { getAdminContext } from '../../../../lib/auth';
import leagueRepository from '../../../../lib/data/supabase/leagueRepository';
import { createClient } from '../../../../lib/supabase/server';

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

  const calendar = await leagueRepository.getLeagueCalendarData(await createClient(), {
    courseId: context.courseId,
    leagueId: selectedLeague.id,
  });
  if (!calendar) return NextResponse.json({ error: 'League not found' }, { status: 404 });
  const icsData = buildICalCalendar(calendar);

  return new Response(icsData, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="birvo-league-${selectedLeague.id}.ics"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
