# SQLite Runtime Removal

**Status: complete.** Finished August 29, 2026.

## Decision

Birvo runs on **PostgreSQL/Supabase only**. The dual-backend design — every feature written twice, dispatched through `if (resolveDataBackend() === DATA_BACKENDS.SUPABASE)` — doubled the cost of every change and was the direct cause of the broken build repaired earlier that day.

## Exit rule

```bash
grep -rl "lib/database" app/          # returns nothing
grep -rl "db.prepare" lib/services/   # returns nothing
```

Both return nothing. `BIRVO_DATA_BACKEND` and `BIRVO_SUPABASE_CUTOVER_COMPLETE` are gone from the code and from `.env.example`; a flag with one valid value is dead weight. `test/platform-shell.test.js` asserts all of this on every run, so the condition cannot quietly regress.

## What was removed

| Removed | Why |
|---|---|
| 39 route and action files under `app/` | Each carried a SQLite branch beside its Supabase branch. |
| 21 services under `lib/services/` | Same. Nine were deleted outright once the SQLite half was gone; the rest kept only their pure calculations. |
| `lib/database/` | The SQLite connection, migrations and integrity checks. Nothing imported it. |
| `lib/data/backend.js` | The backend flag itself. |
| `lib/ghostLogic.js` | Dead: nothing had imported it. |
| `scripts/` (15 files) | SQLite migration and seed scripts for a schema the app no longer uses. |
| `better-sqlite3` | No longer a dependency. |

Deleted services: `auditService`, `ghostManagementService`, `handicapService`, `healthService`, `publicLinkService`, `reconciliationService`, `scoreCorrectionService`, `superAdminService`, `trashService`, `tvService`, `weatherService`, `standingsService` (its one pure function moved to the domain layer).

## What moved, and where

Two pure calculations were called directly by the repository layer, which inverted the dependency between repositories and services — and in one case produced a genuine `require` cycle. Both moved down into the domain layer:

- `buildLeagueStandings` → `lib/domain/standings.js`
- `normalizeRSVPStatus` → `lib/domain/rsvp.js`

## Gaps this surfaced

Removing the SQLite half exposed three places where no PostgreSQL path existed at all:

- **`app/api/qr`** validated the public league link against SQLite. Now uses `publicAccessRepository`.
- **Season end** archived a league by writing `leagues.archived_at`, a column that exists only in the SQLite schema. Added the `archive_league` RPC (migration `202608290003`).
- **Billing writes** had no PostgreSQL implementation and no write RPC. Billing is now explicitly read-only, and the actions say so rather than appearing to succeed.

## Where the test coverage went

The 109-test suite was built on SQLite, so 23 tests were exercising implementations that no longer exist. Coverage did not shrink; it moved to where the logic now lives.

- **Pure calculations** stayed in JavaScript and gained a dedicated suite, `test/pure-logic.test.js`: standings, course setup gating, round-close readiness, iCalendar output, FIR/GIR statistics, CSV injection defence, roster CSV parsing, onboarding and invitation validation.
- **Business rules that became SQL** moved to `supabase/tests/database/003_scoring_rules.test.sql`: score-batch validation and rollback, handicap recalculation, the handicap snapshot on resubmission, ghost-score protection, round locking and advancement, the locked-round write guard, the frozen scoring format, and one-workspace-per-account.
- **`test/platform-shell.test.js`** now also asserts the exit rule itself.

Suite totals: 78 Node assertions, plus 129 pgTAP assertions (82 schema contract, 20 tenant isolation, 27 scoring rules) against the live database.
