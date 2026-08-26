class SupabaseDataError extends Error {
  constructor(operation, error) {
    super(`The ${operation} data operation failed.`);
    this.name = 'SupabaseDataError';
    this.code = error?.code || 'SUPABASE_DATA_ERROR';
    this.operation = operation;
    this.details = error?.details || null;
    this.hint = error?.hint || null;
    this.cause = error || null;
  }
}

function unwrapSupabaseResult(result, operation) {
  if (!result || typeof result !== 'object') {
    throw new SupabaseDataError(operation, { code: 'INVALID_DATA_RESPONSE' });
  }
  if (result.error) throw new SupabaseDataError(operation, result.error);
  return result.data;
}

async function executeRpc(client, functionName, parameters, operation = functionName) {
  if (!client || typeof client.rpc !== 'function') {
    throw new SupabaseDataError(operation, { code: 'INVALID_SUPABASE_CLIENT' });
  }
  return unwrapSupabaseResult(await client.rpc(functionName, parameters), operation);
}

module.exports = {
  SupabaseDataError,
  executeRpc,
  unwrapSupabaseResult,
};
