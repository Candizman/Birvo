# Reconciliation Cutover

## Changes Made

1. **PostgreSQL RPCs (`202608260003_birvo_reconciliation.sql`)**
   - Added `resolve_score`: A scoped RPC that updates the score's reconciliation status to 'ok', and instantly recalculates the team's Simple League Handicap using the exact same formula as the Node version (`max(0, round(((avg - 36) * 0.8), 1))`). It prevents mutation if the parent round is locked.
   - Added `delete_disputed_score`: A scoped RPC that safely deletes a score only if its status is 'needs_review' and the round is not locked.

2. **Service Abstractions**
   - Created `reconciliationRepository.js` for reading the list of scores needing review and calling the new RPCs.
   - Created `reconciliationService.js` to dispatch logic between `DATA_BACKENDS.SUPABASE` and SQLite. The SQLite fallback logic was preserved verbatim.

3. **Frontend Routes**
   - Refactored `app/admin/reconciliation/page.js` to fetch using `getScoresPendingReconciliationAsync`.
   - Refactored `app/admin/reconciliation/actions.js` to run mutations via the async service wrappers instead of executing raw SQLite transactions.

## Validation Results
- `npm run test` local parity suite passes `109/109` confirming no SQLite regressions.
- The `Reconciliation` P1 priority in `DAL_CUTOVER_MATRIX.md` is now complete.
