import { NextResponse } from 'next/server';
import db from '../../../../../lib/database';
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

  const league = db.prepare("SELECT id, name FROM leagues WHERE id = ? AND course_id = ?").get(id, context.courseId);
  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const csv = generateCSVExport(db, id);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="birvo-league-${id}-scores.csv"`,
      'Cache-Control': 'private, no-store'
    }
  });
}
