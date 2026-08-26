const path = require('path');
const { createDatabase } = require('../lib/database/createDatabase');
const { runMigrations } = require('../lib/database/migrations');
const { backupDatabase } = require('./db-backup');

async function migrate() {
  const dbPath = path.join(process.cwd(), 'birvo.db');
  const backupDir = path.join(process.cwd(), 'backups');
  console.log(`Database Path: ${dbPath}`);

  await backupDatabase(dbPath, backupDir);
  const db = createDatabase(dbPath);
  try {
    const result = runMigrations(db);
    const integrity = db.pragma('integrity_check', { simple: true });
    const foreignKeyViolations = db.pragma('foreign_key_check');
    if (integrity !== 'ok' || foreignKeyViolations.length > 0) {
      throw new Error('Post-migration integrity verification failed. Restore the newest backup before continuing.');
    }
    console.log(`Migration complete. Schema version: ${result.currentVersion || db.pragma('user_version', { simple: true })}`);
  } finally {
    db.close();
  }
}

migrate().catch(error => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});
