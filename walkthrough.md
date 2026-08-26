# Reports and Downloads Cutover

## Changes Made

1. **Database Layer (`lib/data/supabase/reportRepository.js`)**
   - Created `reportRepository.js` with new Supabase/PostgreSQL functions to fetch report data: `getCourseHoleDifficultyStats`, `getHoleHeatmap`, `getPlayerFormTrend`, `getWeeklyDigest`, and `getLeagueCSVData`.
   - These functions mirror the data structures provided by the local SQLite database.

2. **Service Abstraction (`lib/services/reportService.js`)**
   - Refactored `reportService.js` to dispatch calls between the new `reportRepository.js` and the existing SQLite queries using the `DATA_BACKENDS` abstraction.
   - Retained the `escapeCSVCell` function securely within the Node layer, ensuring that CSV formulas like `=SUM()` remain escaped and protected from CSV injection, regardless of the data backend.

3. **Frontend Routes**
   - Updated `app/admin/reports/page.js` to use the new abstract async generators.
   - Updated `app/api/reports/csv/[leagueId]/route.js` to instantiate the `adminClient` and securely request CSV downloads.

## Validation Results

- SQLite tests successfully pass without regressions (`109/109`).
- Formula escaping is safely maintained in the Node boundary.
- The `Reports` P0 priority in `DAL_CUTOVER_MATRIX.md` is now complete.
