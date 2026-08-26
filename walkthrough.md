# Handicaps Cutover

## Changes Made

1. **PostgreSQL RPCs (`202608260004_birvo_handicaps.sql`)**
   - Added `adjust_handicap_manually`: A scoped RPC that updates a team's `current_handicap` and `ghin_number`, while simultaneously writing an immutable `handicap_audit_logs` entry in a single atomic transaction.

2. **Service Abstractions**
   - Created `handicapRepository.js` for reading the sorted team roster and the latest 100 handicap audit logs.
   - Created `handicapService.js` to dispatch read and write logic between `DATA_BACKENDS.SUPABASE` and SQLite. 

3. **Frontend Routes & UI Truthfulness**
   - Refactored `app/admin/handicaps/page.js` and `app/admin/handicaps/actions.js` to run via the abstract service wrappers instead of executing raw SQLite queries.
   - Stripped out "USGA WHS 2024 Compliance" branding and simulated fake 8-of-20 differential modals from `HandicapView.jsx`. The UI now accurately reflects that the backend generates a **Simple League Handicap** (`max(0, (avg - 36) * 0.8)`). This resolves the product requirement to reconcile the UI claim with the actual simple calculator.

## Validation Results
- `npm run test` local parity suite passes `109/109` confirming no SQLite regressions.
- The `Handicaps` P1 priority in `DAL_CUTOVER_MATRIX.md` is now complete.
