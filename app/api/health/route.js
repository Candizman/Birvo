import db from '../../../lib/database';
import healthService from '../../../lib/services/healthService';
import dataBackend from '../../../lib/data/backend';
import postgresHealth from '../../../lib/data/supabase/healthRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const { getHealthSnapshot } = healthService;
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { getSupabaseHealthSnapshot } = postgresHealth;

export async function GET() {
  let snapshot;
  let backend = 'unavailable';
  try {
    backend = resolveDataBackend(process.env, { requireCutover: false });
    snapshot = backend === DATA_BACKENDS.SUPABASE
      ? await getSupabaseHealthSnapshot(createAdminClient())
      : getHealthSnapshot(db);
    if (
      backend === DATA_BACKENDS.SUPABASE
      && process.env.NODE_ENV === 'production'
      && process.env.BIRVO_SUPABASE_CUTOVER_COMPLETE !== 'true'
    ) {
      snapshot = {
        ...snapshot,
        ready: false,
        status: 'unavailable',
        checks: { ...snapshot.checks, cutover: 'closed' },
      };
    }
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
      backend,
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
