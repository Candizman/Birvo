const EXPECTED_SCHEMA_VERSION = 17;

function getHealthSnapshot(db, expectedSchemaVersion = EXPECTED_SCHEMA_VERSION) {
  let database = 'unavailable';
  let schema = 'unknown';
  let currentSchemaVersion = null;

  try {
    const probe = db.prepare('SELECT 1 AS ok').get();
    if (probe?.ok === 1) database = 'ok';

    currentSchemaVersion = db.pragma('user_version', { simple: true });
    schema = currentSchemaVersion === expectedSchemaVersion ? 'ok' : 'mismatch';
  } catch {
    // Health responses intentionally omit database error details and tenant data.
  }

  const ready = database === 'ok' && schema === 'ok';
  return {
    ready,
    status: ready ? 'ok' : 'unavailable',
    checks: {
      database,
      schema,
    },
    schemaVersion: {
      current: currentSchemaVersion,
      expected: expectedSchemaVersion,
    },
  };
}

module.exports = {
  EXPECTED_SCHEMA_VERSION,
  getHealthSnapshot,
};
