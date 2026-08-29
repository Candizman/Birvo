import { NextResponse } from 'next/server';
import { generateCSVExport } from '../../../../../lib/services/reportService';
import { getAdminContext } from '../../../../../lib/auth';

export async function GET(request, { params }) {
  const { leagueId } = await params;
  const id = parseInt(leagueId);
  const context = await getAdminContext();

  if (!context?.courseId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!id) {
    return NextResponse.json({ error: 'Invalid League ID' }, { status: 400 });
  }

  const { createAdminClient } = require('../../../../../lib/supabase/admin');
  const adminClient = createAdminClient();
  const { getLeagueAsync } = require('../../../../../lib/services/leagueService');

  const league = await getLeagueAsync(adminClient, id);
  if (!league || league.course_id !== context.courseId) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const csv = await require('../../../../../lib/services/reportService').generateCSVExportAsync(adminClient, id);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="birvo-league-${id}-scores.csv"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
