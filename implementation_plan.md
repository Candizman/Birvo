# Roster Import Cutover

This plan addresses the P1 task "Roster import" from the DAL Cutover Matrix.

## User Review Required
> [!IMPORTANT]
> To support `.xlsx` parsing, I will install the `xlsx` package (SheetJS) via npm, as it is the industry standard for server-side spreadsheet parsing. If you prefer a different library (e.g. `exceljs`), please let me know.

## Open Questions
None.

## Proposed Changes

### PostgreSQL Migrations

#### [NEW] `supabase/migrations/202608260002_birvo_roster_import.sql`
- Add an RPC `preview_roster_import(p_import_id, p_course_id, p_league_id, p_actor_id, p_source_name, p_rows jsonb)` that atomically inserts the batch header and all preview rows.
- Add an RPC `commit_roster_import(p_import_id, p_actor_id, p_credentials jsonb)` that iterates over the valid rows, asserts no duplicates exist, inserts into `teams` using the provided PIN hashes, updates the `roster_import_rows` with the new team IDs, marks the import as committed, and writes the audit log.

### Application Layer (`lib/services/rosterImportService.js`)
- Install `xlsx` package.
- Update `parseCsv` to detect `.xlsx` binary buffers and parse them using `xlsx` to extract a 2D array identical to CSV.
- Update `previewRosterImport` to accept `fileBuffer` and `fileName`. It will parse CSV or XLSX based on extension.
- Update `previewRosterImport` to dispatch to the active data backend (`DATA_BACKENDS.SUPABASE` vs SQLite). If Supabase, call the new `preview_roster_import` RPC.
- Update `commitRosterImport` to generate PIN hashes in Node, build the credentials JSON, and call `commit_roster_import` RPC when Supabase is active.

### Frontend Routes (`app/admin/roster-import/actions.js` & `RosterImportView.jsx`)
- Update `actions.js` to pass `fileBuffer` instead of text, allowing the service to handle XLSX buffers.
- Update `RosterImportView.jsx` file input `accept` attribute to include `.xlsx`.

## Verification Plan

### Automated Tests
- Run `npm run test` to verify SQLite parity.
- Add a test for `.xlsx` import if possible.

### Manual Verification
- Start the server, navigate to `/admin/roster-import`.
- Upload a valid CSV and a valid XLSX file.
- Verify preview quarantines duplicate/invalid data correctly.
- Commit the import and verify PINs are issued and teams are created successfully.
