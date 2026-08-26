const Database = require('better-sqlite3');

function createDatabase(dbPath) {
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  return db;
}

module.exports = { createDatabase };
