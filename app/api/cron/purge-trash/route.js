import { NextResponse } from 'next/server';
import db from '../../../../lib/database';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { purgeExpiredTrashAsync } from '../../../../lib/services/trashService';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Very basic authorization check to ensure only the cron provider can trigger this
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();
    const deletedCount = await purgeExpiredTrashAsync(db, adminClient);
    
    return NextResponse.json({ success: true, purged: deletedCount });
  } catch (error) {
    console.error('Error during scheduled trash purge:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
