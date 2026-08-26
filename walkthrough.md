# Trash & Data Recovery Cutover

## Changes Made

1. **PostgreSQL RPCs (`202608260005_birvo_trash.sql`)**
   - Added `trash_league`: Securely soft-deletes a league by moving it to the `trashed` status.
   - Added `restore_league`: Restores a trashed league back to active status.
   - Added `purge_expired_trash`: Executes an integrity-checked deletion (leveraging `ON DELETE CASCADE` relations throughout the database) to permanently purge leagues that have been in the trash for > 30 days.

2. **Service Abstractions**
   - Created `trashRepository.js` and `trashService.js` to dispatch read and write logic between `DATA_BACKENDS.SUPABASE` and SQLite.

3. **Frontend Routes & Cron**
   - Refactored `app/admin/trash/page.js` to fetch trashed leagues using the service layer.
   - Refactored `app/admin/trash/actions.js` to execute `restoreLeagueAsync` using the service layer.
   - Added `app/api/cron/purge-trash/route.js`, an API route protected by `CRON_SECRET`, which executes `purgeExpiredTrashAsync` to permanently delete expired data automatically on a schedule.

## Validation Results
- `npm run test` local parity suite passes `109/109` confirming no SQLite regressions.
- The `Trash` P1 priority in `DAL_CUTOVER_MATRIX.md` is now complete.
