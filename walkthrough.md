# Roster Import Cutover

## Changes Made

1. **Excel Support (XLSX)**
   - Installed `xlsx` package to support `.xlsx` imports alongside `.csv`.
   - Updated `RosterImportView.jsx` file input to accept both formats.
   - Refactored `actions.js` to process file uploads as array buffers rather than raw text strings.
   - Implemented `parseSpreadsheetBuffer` in `rosterImportService.js` to abstract parsing. Both formats output the identical 2D array structure.

2. **Supabase Cutover (`rosterImportService.js` & `operationsRepository.js`)**
   - Maintained synchronous `previewRosterImport` and `commitRosterImport` functions solely for legacy SQLite parity tests.
   - Created `previewRosterImportAsync` and `commitRosterImportAsync` that route requests based on `DATA_BACKENDS.SUPABASE`.
   - When Supabase is active, PIN codes are generated securely in the Node process and hashed before being transmitted to the database.

3. **PostgreSQL RPCs (`202608260002_birvo_roster_import.sql`)**
   - Added `preview_roster_import`: Atomically creates the `roster_imports` batch and inserts all `roster_import_rows` using `jsonb_array_elements`. Writes the preview audit log.
   - Added `commit_roster_import`: Receives the hashed PIN credentials in a JSON blob. Verifies the batch is still in 'preview', checks that no matching names exist in `teams`, and iterates over valid rows to insert them and return the new UUIDs to `roster_import_rows`. Emits a commit audit log upon completion.

## Validation Results
- `npm run test` local parity suite passes `109/109` confirming no SQLite regressions.
- Excel (`.xlsx`) parsing successfully integrated behind the same validation constraints as `.csv`.
