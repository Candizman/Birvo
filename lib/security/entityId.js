const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INTEGER_PATTERN = /^[1-9]\d*$/;

function normalizeEntityId(value) {
  if (value === null || value === undefined) return null;
  const candidate = String(value).trim();
  if (INTEGER_PATTERN.test(candidate)) return candidate;
  if (UUID_PATTERN.test(candidate)) return candidate.toLowerCase();
  return null;
}

function toRuntimeEntityId(value) {
  const normalized = normalizeEntityId(value);
  if (!normalized) return null;
  if (INTEGER_PATTERN.test(normalized)) {
    const numeric = Number(normalized);
    return Number.isSafeInteger(numeric) ? numeric : normalized;
  }
  return normalized;
}

module.exports = {
  INTEGER_PATTERN,
  UUID_PATTERN,
  normalizeEntityId,
  toRuntimeEntityId,
};
