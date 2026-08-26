function checkIntegrity(db) {
  const integrity = db.pragma('integrity_check');
  const foreignKeys = db.pragma('foreign_key_check');
  return {
    integrityOk: integrity.length === 1 && integrity[0].integrity_check === 'ok',
    integrityResults: integrity,
    foreignKeysOk: foreignKeys.length === 0,
    foreignKeyResults: foreignKeys
  };
}

module.exports = { checkIntegrity };
