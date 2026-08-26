# Birvo Architecture and Data Integrity

## 1. Tenant boundaries

Every data operation must be scoped by an authorized `course_id` or `league_id`. Server actions and download endpoints must validate that the requested league belongs to the current administrator’s course before reading or writing data.

`scoreService.saveScoresBatch` verifies each incoming `teamId` against the active `leagueId`. A team from another league causes the complete transaction to fail.

## 2. Database connection and test injection

`lib/database/index.js` exports one `better-sqlite3` connection during normal development. Under `NODE_ENV=test`, tests create isolated in-memory or temporary databases through `createDatabase(':memory:')`. The test wrapper also verifies that `birvo.db` does not change.

## 3. Migration safety

Migrations use `db.transaction()` for schema creation, data movement, and legacy cleanup. Invalid orphaned legacy records must fail the migration instead of being assigned a magic course or league identifier. `user_version` advances only after a successful transaction.

## 4. Score-batch transactions

Rapid score entry sends the full batch to `saveScoresBatch`. All scores are processed inside one transaction. Invalid types, out-of-range scores, inactive teams, or cross-tenant team identifiers roll back the entire batch; partial writes are not allowed.

## 5. Handicap snapshots

When a score is recorded, the team’s current handicap is copied to `handicap_used`. Net score is calculated from this immutable snapshot. Later team-handicap changes or score edits must not alter the historical handicap applied to the round.

## 6. Reconciliation

Legacy records with missing `handicap_used` or `net_score` are retained with `reconciliation_status = 'needs_review'`. These records are excluded from standings and future handicap calculations until an administrator resolves them.

## 7. Public access

Public standings, TV, registration, and player links use HMAC-signed tokens scoped by league, purpose, and expiration. Production requires `PUBLIC_LINK_SECRET`; missing or invalid tokens must fail closed.

Player sessions and registration receipts use separate signed tokens. Production requires `PLAYER_SESSION_SECRET`. New four-digit PINs are stored as salted `scrypt` hashes, while legacy plaintext values are upgraded after successful verification.

## 8. Production data direction

SQLite is restricted to local preview and tests. `lib/data/backend.js` requires an explicit Supabase backend in production and keeps a separate cutover gate closed until the runbook is complete. It never enables dual writes.

The PostgreSQL contract is versioned in three migrations under `supabase/migrations`. Feature-parity tables use UUID identifiers and tenant keys, public tables use RLS, server-only rate-limit records live in the private schema, and multi-row business changes use explicitly granted atomic functions.

Supabase repositories under `lib/data/supabase` now cover workspace context, onboarding, critical scoring/round/correction operations, staff-access mutations, public-link rotation, invitation acceptance, and persistent rate limits. Remaining application consumers are tracked in `docs/DAL_CUTOVER_MATRIX.md`; the production flag must remain closed until the matrix is complete and the PostgreSQL pgTAP suite passes in staging.
