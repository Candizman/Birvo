const DATA_BACKENDS = Object.freeze({
  SQLITE: 'sqlite',
  SUPABASE: 'supabase',
});

class DataBackendConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DataBackendConfigurationError';
    this.code = 'DATA_BACKEND_CONFIGURATION_ERROR';
  }
}

function resolveDataBackend(env = process.env, { requireCutover = true } = {}) {
  const requested = String(env.BIRVO_DATA_BACKEND || '').trim().toLowerCase();
  const isProduction = env.NODE_ENV === 'production';

  if (!requested) {
    if (isProduction) {
      throw new DataBackendConfigurationError(
        'BIRVO_DATA_BACKEND must be explicitly set to "supabase" in production.'
      );
    }
    return DATA_BACKENDS.SQLITE;
  }

  if (!Object.values(DATA_BACKENDS).includes(requested)) {
    throw new DataBackendConfigurationError(
      `Unsupported BIRVO_DATA_BACKEND value: ${requested}`
    );
  }

  if (isProduction && requested === DATA_BACKENDS.SQLITE) {
    throw new DataBackendConfigurationError(
      'SQLite is restricted to local development and test environments.'
    );
  }

  if (requested === DATA_BACKENDS.SUPABASE) {
    if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new DataBackendConfigurationError(
        'Supabase data mode requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
      );
    }

    if (isProduction && requireCutover && env.BIRVO_SUPABASE_CUTOVER_COMPLETE !== 'true') {
      throw new DataBackendConfigurationError(
        'The Supabase production cutover gate is closed. Complete the cutover runbook before enabling traffic.'
      );
    }
  }

  return requested;
}

module.exports = {
  DATA_BACKENDS,
  DataBackendConfigurationError,
  resolveDataBackend,
};
