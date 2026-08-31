const { randomInt, randomUUID } = require('node:crypto');
const { hashTeamPin } = require('../security/pin');

const xlsx = require('xlsx');
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
async function previewRosterImport(adminClient, { courseId, leagueId, uploadedByUserId, sourceName, fileBuffer }) {
  if (fileBuffer.length > 1024 * 1024) throw new Error('Files must be smaller than 1 MB.');
  const parsed = parseSpreadsheetBuffer(fileBuffer, sourceName);

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

// A four-digit PIN is generated per imported team and hashed before it leaves this
// process. The plaintext is returned once, for the admin to hand to each player,
// and is never stored.
async function commitRosterImport(adminClient, { importId, courseId, actorUserId }) {
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

module.exports = { parseCsv, parseSpreadsheetBuffer, previewRosterImport, commitRosterImport };
