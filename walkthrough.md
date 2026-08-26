# Cart Signs Cutover

## Changes Made

1. **Service Abstractions**
   - Created `cartSignsRepository.js` to handle heavily-relational read operations using Supabase's `select()` join syntax.
     - `getCourseAndLeague`
     - `getActiveTeams`
     - `getTeeTimesForWeek` (joins `team1_id` and `team2_id`)
     - `getFixturesForWeek` (joins `team1_id` and `team2_id`)
   - Created `cartSignsService.js` to dispatch read logic between `DATA_BACKENDS.SUPABASE` and SQLite. The SQLite fallback logic was preserved verbatim.

2. **Frontend Routes**
   - Refactored `app/admin/cart-signs/page.js` to run via the abstract service wrapper instead of executing raw SQLite queries.
   - Updated the printable footer from "Official USGA WHS Card" to "Official Simple League Handicap" to match the reality of the formulas used, aligning with the previous task's focus on UI truthfulness.

## Validation Results
- `npm run test` local parity suite passes `109/109` confirming no SQLite regressions.
- The `Cart signs` P1 priority in `DAL_CUTOVER_MATRIX.md` is now complete.
