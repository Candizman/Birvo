import postgresHealth from '../../../lib/data/supabase/healthRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { getSupabaseHealthSnapshot } = postgresHealth;

export async function GET() {
  let snapshot;
  try {
    snapshot = await getSupabaseHealthSnapshot(createAdminClient());
  } catch {
    snapshot = {
      ready: false,
      status: 'unavailable',
      checks: { database: 'unavailable', schema: 'unknown' },
      schemaVersion: { current: null, expected: null },
    };
  }

  return Response.json(
    {
      service: 'birvo-web',
      backend: 'postgres',
      ...snapshot,
      checkedAt: new Date().toISOString(),
    },
    {
      status: snapshot.ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
