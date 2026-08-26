const path = require('path');
const { createDatabase } = require('../lib/database/createDatabase');

function audit() {
  const dbPath = path.join(process.cwd(), 'birvo.db');
  console.log('--- DATABASE AUDIT REPORT ---');
  console.log(`Database Path: ${dbPath}`);

  let db;
  try {
    db = createDatabase(dbPath);
  } catch (err) {
    console.error('Cannot open database:', err.message);
    process.exit(1);
  }

  const userVersion = db.pragma('user_version', { simple: true });
  console.log(`User Version: ${userVersion}`);

  const journalMode = db.pragma('journal_mode', { simple: true });
  console.log(`Journal Mode: ${journalMode}`);

  const integrity = db.pragma('integrity_check').map(r => r.integrity_check);
  console.log(`Integrity Check: ${integrity.join(', ')}`);

  const foreignKeys = db.pragma('foreign_key_check');
  console.log(`Foreign Key Check: ${foreignKeys.length === 0 ? 'ok' : JSON.stringify(foreignKeys)}`);

  const tables = db.pragma('table_list').filter(t => t.type === 'table').map(t => t.name);
  console.log(`Tables: ${tables.join(', ')}`);

  console.log('\n--- TABLE DETAILS ---');
  tables.forEach(table => {
    try {
      const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
      console.log(`[${table}] Rows: ${rowCount}`);

      const fkList = db.pragma(`foreign_key_list(${table})`);
      if (fkList.length > 0) {
        console.log(`  Foreign Keys: ${fkList.map(fk => `${fk.from} -> ${fk.table}(${fk.to})`).join(', ')}`);
      }

      const indexList = db.pragma(`index_list(${table})`);
      if (indexList.length > 0) {
        console.log(`  Indexes: ${indexList.map(i => `${i.name} (Unique: ${i.unique})`).join(', ')}`);
      }
    } catch (err) {
      console.error(`  Error reading table ${table}:`, err.message);
    }
  });

  console.log('\n--- DATA ANOMALY CHECK ---');
  let hasErrors = false;

  // Duplicate match/team (v2 schema) or duplicate team/week (v1 schema)
  if (tables.includes('scores')) {
    try {
      const cols = db.pragma('table_info(scores)').map(c => c.name);
      if (cols.includes('week_number')) {
        // v1 legacy structure
        const duplicates = db.prepare(`
          SELECT team_id, week_number, COUNT(*) as count
          FROM scores
          GROUP BY team_id, week_number
          HAVING count > 1
        `).all();
        console.log(`Duplicate scores (team/week): ${duplicates.length}`);
        if (duplicates.length > 0) hasErrors = true;
      } else if (cols.includes('match_id')) {
        // v2 structure
        const duplicates = db.prepare(`
          SELECT match_id, team_id, COUNT(*) as count
          FROM scores
          GROUP BY match_id, team_id
          HAVING count > 1
        `).all();
        console.log(`Duplicate scores (match/team): ${duplicates.length}`);
        if (duplicates.length > 0) hasErrors = true;
      }

      const nulls = db.prepare(`
        SELECT COUNT(*) as count
        FROM scores
        WHERE reconciliation_status = 'needs_review' OR handicap_used IS NULL OR net_score IS NULL
      `).get().count;
      if (nulls > 0) {
        console.log(`[WARNING] Records awaiting reconciliation (needs_review): ${nulls} records contain incomplete data and will not appear in the dashboard.`);
      } else {
        console.log('Records awaiting reconciliation: 0');
      }

    } catch (err) {
      console.error('Error checking anomalies in scores:', err.message);
    }
  }

  // Orphan records
  if (tables.includes('scores') && tables.includes('teams')) {
    try {
      const orphanScores = db.prepare(`
        SELECT COUNT(*) as count
        FROM scores
        LEFT JOIN teams ON scores.team_id = teams.id
        WHERE teams.id IS NULL
      `).get().count;
      console.log(`Orphan scores (missing team): ${orphanScores}`);
      if (orphanScores > 0) hasErrors = true;
    } catch (e) {}
  }

  console.log('\nAUDIT RESULT: ' + (hasErrors || foreignKeys.length > 0 || integrity[0] !== 'ok' ? 'FAILED' : 'PASSED'));

  if (hasErrors || foreignKeys.length > 0 || integrity[0] !== 'ok') {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

audit();
