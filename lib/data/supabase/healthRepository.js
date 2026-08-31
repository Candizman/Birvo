// Kept in sync with the highest schema_version any file in supabase/migrations
// sets -- test/postgres-contract.test.js fails if a migration bumps that
// number without this one following it. This constant sat at 4 through 24
// migrations that carried the real schema to 27, so /api/health silently
// reported "unavailable" the whole time; found 2026-08-31.
const EXPECTED_POSTGRES_SCHEMA_VERSION = 28;

async function getSupabaseHealthSnapshot(client, expectedSchemaVersion = EXPECTED_POSTGRES_SCHEMA_VERSION) {
  let database = 'unavailable';
  let schema = 'unknown';
  let currentSchemaVersion = null;

  try {
    if (!client) throw new Error('Missing service client');
    const { data, error } = await client
      .from('app_metadata')
      .select('schema_version')
      .eq('key', 'database')
      .maybeSingle();
    if (error) throw error;
    database = 'ok';
    currentSchemaVersion = Number.isInteger(data?.schema_version) ? data.schema_version : null;
    schema = currentSchemaVersion === expectedSchemaVersion ? 'ok' : 'mismatch';
  } catch {
    // Readiness responses deliberately exclude database/provider details.
  }

  const ready = database === 'ok' && schema === 'ok';
  return {
    ready,
    status: ready ? 'ok' : 'unavailable',
    checks: { database, schema },
    schemaVersion: { current: currentSchemaVersion, expected: expectedSchemaVersion },
  };
}

module.exports = {
  EXPECTED_POSTGRES_SCHEMA_VERSION,
  getSupabaseHealthSnapshot,
};
