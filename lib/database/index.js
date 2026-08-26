const path = require('path');
const { createDatabase } = require('./createDatabase');
const { checkIntegrity } = require('./integrity');

const dbPath = path.join(process.cwd(), 'birvo.db');
let dbInstance = null;

if (process.env.NODE_ENV !== 'test') {
  dbInstance = createDatabase(dbPath);

  const userVersion = dbInstance.pragma('user_version', { simple: true });
  if (userVersion !== 17 && userVersion !== 0) {
    console.warn(`[WARNING] Unexpected schema version: ${userVersion}. Expected 17. Please run 'npm run db:migrate'`);
  }
}

// Proxy the default export so we can attach properties even if instance is null
const dbExport = dbInstance || {};
dbExport.createDatabase = createDatabase;
dbExport.checkIntegrity = checkIntegrity;

module.exports = dbExport;
