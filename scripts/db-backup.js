const fs = require('fs');
const path = require('path');
const { createDatabase } = require('../lib/database/createDatabase');

async function backupDatabase(sourceDbPath = 'birvo.db', backupDir = 'backups') {
  const resolvedSource = path.resolve(sourceDbPath);
  const resolvedBackupDir = path.resolve(backupDir);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Source database file not found: ${resolvedSource}`);
  }
  fs.mkdirSync(resolvedBackupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const targetPath = path.join(resolvedBackupDir, `birvo-backup-${timestamp}.db`);
  const db = createDatabase(resolvedSource);
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    const foreignKeyViolations = db.pragma('foreign_key_check');
    if (integrity !== 'ok' || foreignKeyViolations.length > 0) {
      throw new Error(`Database integrity verification failed before backup.`);
    }
    await db.backup(targetPath);
    console.log(`Database backup created successfully: ${targetPath}`);
    return targetPath;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  backupDatabase().catch(error => {
    console.error('Backup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { backupDatabase };
