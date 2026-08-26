const { randomInt, randomUUID } = require('node:crypto');
const { hashTeamPin } = require('../security/pin');
const { writeAuditEvent } = require('./auditService');

const xlsx = require('xlsx');
const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const operationsRepository = require('../data/supabase/operationsRepository');
const { getActiveLeagueContext } = require('../data/supabase/playerRepository');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some(value => value.trim() !== '')) rows.push(row);
  return rows;
}

function parseSpreadsheetBuffer(buffer, fileName) {
  if (fileName.toLowerCase().endsWith('.csv')) {
    return parseCsv(buffer.toString('utf8'));
  }
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  // `defval: ''` ensures empty cells don't shift the array
  return xlsx.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: '' });
}

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeRosterRows(parsed, existingTeamNames) {
  if (parsed.length < 2) throw new Error('The file must include a header and at least one roster row.');
  if (parsed.length > 501) throw new Error('Import a maximum of 500 rows at a time.');
  const headers = parsed[0].map(normalizeHeader);
  const nameIndex = headers.findIndex(value => ['team_name', 'name', 'team'].includes(value));
  const emailIndex = headers.findIndex(value => ['email', 'contact_email'].includes(value));
  const handicapIndex = headers.findIndex(value => ['handicap', 'handicap_index', 'index'].includes(value));
  if (nameIndex < 0) throw new Error('Add a team_name column to the file.');

  const seen = new Set();
  const normalizedRows = parsed.slice(1).map((values, index) => {
    const name = String(values[nameIndex] || '').trim().replace(/\s+/g, ' ');
    const email = emailIndex >= 0 ? String(values[emailIndex] || '').trim().toLowerCase() : '';
    const handicapRaw = handicapIndex >= 0 ? String(values[handicapIndex] || '').trim() : '0';
    const handicap = handicapRaw === '' ? 0 : Number(handicapRaw);
    const errors = [];
    if (name.length < 2 || name.length > 80) errors.push('Team name must contain 2–80 characters.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Contact email is invalid.');
    if (!Number.isFinite(handicap) || handicap < -10 || handicap > 54) errors.push('Handicap must be between -10 and 54.');
    const key = name.toLowerCase();
    let status = errors.length ? 'invalid' : 'valid';
    if (!errors.length && (existingTeamNames.has(key) || seen.has(key))) { status = 'duplicate'; errors.push('Team name already exists in this league or file.'); }
    if (key) seen.add(key);
    return { rowNumber: index + 2, name, email, handicap: Number.isFinite(handicap) ? handicap : null, status, message: errors.join(' ') };
  });
  return normalizedRows;
}

function previewRosterImport(db, { courseId, leagueId, uploadedByUserId, sourceName, csvText }) {
  if (Buffer.byteLength(csvText, 'utf8') > 1024 * 1024) throw new Error('CSV files must be smaller than 1 MB.');
  const league = db.prepare('SELECT id FROM leagues WHERE id = ? AND course_id = ?').get(leagueId, courseId);
  if (!league) throw new Error('League not found for this course.');
  const parsed = parseCsv(csvText);
  const existing = new Set(db.prepare('SELECT name FROM teams WHERE league_id = ?').all(leagueId).map(item => item.name.trim().toLowerCase()));
  const normalizedRows = normalizeRosterRows(parsed, existing);
  const importId = randomUUID();
  const validRows = normalizedRows.filter(row => row.status === 'valid').length;
  const invalidRows = normalizedRows.length - validRows;

  db.transaction(() => {
    db.prepare(`INSERT INTO roster_imports (id, course_id, league_id, uploaded_by_user_id, source_name, total_rows, valid_rows, invalid_rows) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(importId, courseId, leagueId, uploadedByUserId, String(sourceName || 'roster.csv').slice(0, 180), normalizedRows.length, validRows, invalidRows);
    const insert = db.prepare(`INSERT INTO roster_import_rows (import_id, row_number, raw_json, normalized_name, normalized_email, handicap, validation_status, validation_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const rowItem of normalizedRows) insert.run(importId, rowItem.rowNumber, JSON.stringify(rowItem), rowItem.name, rowItem.email || null, rowItem.handicap, rowItem.status, rowItem.message || null);
    writeAuditEvent(db, { courseId, actorUserId: uploadedByUserId, action: 'roster.import.previewed', targetType: 'roster_import', targetId: importId, metadata: { totalRows: normalizedRows.length, validRows, invalidRows } });
  })();
  return { importId, rows: normalizedRows, totalRows: normalizedRows.length, validRows, invalidRows };
}

async function previewRosterImportAsync(db, adminClient, { courseId, leagueId, uploadedByUserId, sourceName, fileBuffer }) {
  if (fileBuffer.length > 1024 * 1024) throw new Error('Files must be smaller than 1 MB.');
  const parsed = parseSpreadsheetBuffer(fileBuffer, sourceName);

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const context = await getActiveLeagueContext(adminClient, leagueId);
    if (!context || context.league.course_id !== courseId) throw new Error('League not found for this course.');
    
    const { data: teams } = await adminClient.from('teams').select('name').eq('league_id', leagueId);
    const existing = new Set((teams || []).map(item => item.name.trim().toLowerCase()));
    
    const normalizedRows = normalizeRosterRows(parsed, existing);
    const importId = randomUUID();
    const validRows = normalizedRows.filter(row => row.status === 'valid').length;
    const invalidRows = normalizedRows.length - validRows;

    await operationsRepository.previewRosterImport(adminClient, {
      importId, courseId, leagueId, actorUserId: uploadedByUserId, sourceName, 
      totalRows: normalizedRows.length, validRows, invalidRows, rows: normalizedRows
    });

    return { importId, rows: normalizedRows, totalRows: normalizedRows.length, validRows, invalidRows };
  }

  // Fallback to SQLite
  const existing = new Set(db.prepare('SELECT name FROM teams WHERE league_id = ?').all(leagueId).map(item => item.name.trim().toLowerCase()));
  const normalizedRows = normalizeRosterRows(parsed, existing);
  const importId = randomUUID();
  const validRows = normalizedRows.filter(row => row.status === 'valid').length;
  const invalidRows = normalizedRows.length - validRows;

  db.transaction(() => {
    db.prepare(`INSERT INTO roster_imports (id, course_id, league_id, uploaded_by_user_id, source_name, total_rows, valid_rows, invalid_rows) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(importId, courseId, leagueId, uploadedByUserId, String(sourceName || 'roster.csv').slice(0, 180), normalizedRows.length, validRows, invalidRows);
    const insert = db.prepare(`INSERT INTO roster_import_rows (import_id, row_number, raw_json, normalized_name, normalized_email, handicap, validation_status, validation_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const rowItem of normalizedRows) insert.run(importId, rowItem.rowNumber, JSON.stringify(rowItem), rowItem.name, rowItem.email || null, rowItem.handicap, rowItem.status, rowItem.message || null);
    writeAuditEvent(db, { courseId, actorUserId: uploadedByUserId, action: 'roster.import.previewed', targetType: 'roster_import', targetId: importId, metadata: { totalRows: normalizedRows.length, validRows, invalidRows } });
  })();
  return { importId, rows: normalizedRows, totalRows: normalizedRows.length, validRows, invalidRows };
}

function commitRosterImport(db, { importId, courseId, actorUserId }) {
  return db.transaction(() => {
    const batch = db.prepare("SELECT * FROM roster_imports WHERE id = ? AND course_id = ? AND status = 'preview'").get(importId, courseId);
    if (!batch) throw new Error('Import preview not found or already committed.');
    const rows = db.prepare("SELECT * FROM roster_import_rows WHERE import_id = ? AND validation_status = 'valid' ORDER BY row_number").all(importId);
    if (!rows.length) throw new Error('This preview has no valid rows to import.');
    const insert = db.prepare('INSERT INTO teams (league_id, name, contact_email, current_handicap, pin) VALUES (?, ?, ?, ?, ?)');
    const credentials = [];
    for (const row of rows) {
      const duplicate = db.prepare('SELECT id FROM teams WHERE league_id = ? AND name = ? COLLATE NOCASE').get(batch.league_id, row.normalized_name);
      if (duplicate) throw new Error(`Team “${row.normalized_name}” was added after preview. Generate a new preview.`);
      const pin = randomInt(1000, 10000).toString();
      const result = insert.run(batch.league_id, row.normalized_name, row.normalized_email, row.handicap || 0, hashTeamPin(pin));
      db.prepare('UPDATE roster_import_rows SET created_team_id = ? WHERE id = ?').run(result.lastInsertRowid, row.id);
      credentials.push({ teamName: row.normalized_name, pin });
    }
    db.prepare("UPDATE roster_imports SET status = 'committed', committed_at = CURRENT_TIMESTAMP WHERE id = ?").run(importId);
    writeAuditEvent(db, { courseId, actorUserId, action: 'roster.import.committed', targetType: 'roster_import', targetId: importId, metadata: { importedRows: rows.length, leagueId: batch.league_id } });
    return { importedRows: rows.length, credentials };
  })();
}

async function commitRosterImportAsync(db, adminClient, { importId, courseId, actorUserId }) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const { data: batch } = await adminClient.from('roster_imports').select('league_id').eq('id', importId).eq('course_id', courseId).eq('status', 'preview').maybeSingle();
    if (!batch) throw new Error('Import preview not found or already committed.');
    
    const { data: rows } = await adminClient.from('roster_import_rows').select('row_number, normalized_name, id').eq('import_id', importId).eq('validation_status', 'valid').order('row_number');
    if (!rows || !rows.length) throw new Error('This preview has no valid rows to import.');

    const credentials = {};
    const returnCredentials = [];
    
    for (const row of rows) {
      const pin = randomInt(1000, 10000).toString();
      credentials[row.row_number] = hashTeamPin(pin);
      returnCredentials.push({ teamName: row.normalized_name, pin });
    }

    await operationsRepository.commitRosterImport(adminClient, {
      importId, courseId, actorUserId, credentials
    });

    return { importedRows: rows.length, credentials: returnCredentials };
  }

  return commitRosterImport(db, { importId, courseId, actorUserId });
}

module.exports = { parseCsv, parseSpreadsheetBuffer, previewRosterImport, previewRosterImportAsync, commitRosterImport, commitRosterImportAsync };
