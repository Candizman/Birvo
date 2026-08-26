const EXPECTED_POSTGRES_SCHEMA_VERSION = 4;

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
