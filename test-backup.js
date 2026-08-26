const fs = require('fs');
const crypto = require('crypto');
const { createDatabase } = require('./lib/database/createDatabase');
const { runMigrations } = require('./lib/database/migrations');

const backupPath = 'birvo-backup-20260823.db';
const tempPath = 'temp-db.db';

// Get hash, size, mtime
function getStats(path) {
  const stat = fs.statSync(path);
  const buf = fs.readFileSync(path);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return { hash, size: stat.size, mtime: stat.mtimeMs };
}

const backupStats = getStats(backupPath);
console.log('--- PRODUCTION BACKUP STATS ---');
console.log(`Backup Hash: ${backupStats.hash}`);
console.log(`Backup Size: ${backupStats.size}`);
console.log(`Backup mtime: ${backupStats.mtime}`);

fs.copyFileSync(backupPath, tempPath);
const db = createDatabase(tempPath);

console.log('\n--- PRE-MIGRATION STATS ---');
console.log(`User Version: ${db.pragma('user_version', { simple: true })}`);

const tables = ['courses', 'leagues', 'teams', 'matches', 'scores'];
for (const table of tables) {
  try {
    const c = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
    console.log(`[${table}] Row Count: ${c}`);
  } catch (e) {
    console.log(`[${table}] Table missing or corrupted`);
  }
}

try {
  const weekDist = db.prepare('SELECT week_number, COUNT(*) as c FROM scores GROUP BY week_number').all();
  console.log(`Scores week_number distribution:`, weekDist);
} catch (e) {}

try {
  const matchDist = db.prepare('SELECT match_id, COUNT(*) as c FROM scores GROUP BY match_id').all();
  console.log(`Scores match_id distribution:`, matchDist);
} catch (e) {}

console.log('\n--- RUNNING MIGRATIONS ---');
runMigrations(db);

console.log('\n--- POST-MIGRATION STATS ---');
console.log(`User Version: ${db.pragma('user_version', { simple: true })}`);

const newTables = ['courses', 'leagues', 'teams', 'matches', 'scores', 'migration_audit'];
for (const table of newTables) {
  try {
    const c = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
    console.log(`[${table}] Row Count: ${c}`);
  } catch (e) {
    console.log(`[${table}] Table missing or corrupted`);
  }
}

try {
  const matchLeagueWeekDist = db.prepare('SELECT league_id, week_number, COUNT(*) as c FROM matches GROUP BY league_id, week_number').all();
  console.log(`Matches league_id + week_number distribution:`, matchLeagueWeekDist);
} catch (e) {}

try {
  const scoreMatchDist = db.prepare('SELECT m.week_number, COUNT(*) as c FROM scores s JOIN matches m ON s.match_id = m.id GROUP BY m.week_number').all();
  console.log(`Scores week distribution:`, scoreMatchDist);
} catch (e) {}

try {
  const audits = db.prepare('SELECT * FROM migration_audit').all();
  console.log(`migration_audit content:`, audits);
} catch (e) {}

console.log(`integrity_check: ${db.pragma('integrity_check', { simple: true })}`);
console.log(`foreign_key_check:`, db.pragma('foreign_key_check'));

try {
  const orphan = db.prepare(`SELECT COUNT(*) as c FROM scores LEFT JOIN teams ON scores.team_id = teams.id WHERE teams.id IS NULL`).get().c;
  console.log(`Orphan score count: ${orphan}`);
} catch (e) {}

db.close();

// Cleanup
fs.unlinkSync(tempPath);
if (fs.existsSync(tempPath + '-wal')) fs.unlinkSync(tempPath + '-wal');
if (fs.existsSync(tempPath + '-shm')) fs.unlinkSync(tempPath + '-shm');

console.log('\n--- CLEANUP & ISOLATION VERIFICATION ---');
const backupStatsAfter = getStats(backupPath);
console.log(`Backup hash changed?: ${backupStats.hash !== backupStatsAfter.hash}`);
