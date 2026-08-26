# Birvo SQLite to Supabase Cutover Runbook

This runbook intentionally keeps production traffic closed until the full application uses PostgreSQL. The current code contains a safe backend boundary and several migrated slices, but it is not yet a complete production cutover.

## 1. Prepare an isolated staging environment

1. Create a dedicated Supabase staging project; never test migrations against production first.
2. Install the Supabase CLI and a Docker-compatible local runtime.
3. Run `supabase init` at the repository root if local configuration is not present.
4. Link only the staging project and verify the project reference before pushing anything.
5. Configure staging Auth URLs, SMTP, and secrets separately from production.

Required server environment:

```text
BIRVO_DATA_BACKEND=supabase
BIRVO_SUPABASE_CUTOVER_COMPLETE=false
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SECRET_KEY=...
PLAYER_SESSION_SECRET=...
PUBLIC_LINK_SECRET=...
NEXT_PUBLIC_BASE_URL=https://staging.example.com
```

The cutover flag stays `false` while work is incomplete. For controlled staging flow tests, use a non-production deployment environment; never set the production flag merely to bypass an error.

## 2. Validate migrations locally

Apply migrations in filename order:

1. `202608240001_birvo_tenant_foundation.sql`
2. `202608250001_birvo_feature_parity.sql`
3. `202608250002_birvo_atomic_operations.sql`

Then run:

```bash
supabase db reset
supabase test db
npm test
npm run lint
npm run build
```

`supabase test db` must execute both files under `supabase/tests/database`. A static Node test is useful but never substitutes for PostgreSQL parsing, RLS execution, grants, triggers, and pgTAP.

## 3. Validate the staging database

- Confirm `public.app_metadata` contains `database / schema_version 4` through a service-role readiness check.
- Confirm RLS is enabled on every public tenant table.
- Confirm `anon` has no tenant-table privileges and no critical RPC execution privileges.
- Confirm only `service_role` can call rate-limit, invitation-delivery, public-registration, player-PIN, player-scorecard, attestation, profile, bag, and round-note RPCs.
- Create Tenant A and Tenant B users, courses, memberships, leagues, teams, and scores.
- Attempt cross-tenant reads, inserts, updates, deletes, foreign-key references, direct-ID probes, exports, and RPC calls from both users.
- Record the test run, project reference, migration versions, timestamp, and operator.

## 4. Prepare the data conversion

1. Put the SQLite pilot into a documented maintenance window.
2. Create an immutable backup and record its SHA-256 hash, row counts, schema version, and foreign-key/integrity results.
3. Export every table without transforming the source backup.
4. Generate stable UUID mapping files for course, league, team, match, score, invitation, membership, and other referenced IDs.
5. Transform all foreign keys through those maps. Never use a fallback course or league ID.
6. Normalize UTC timestamps, booleans, JSON values, enum names, and renamed fields (`scoring_format` → `game_format`, `eligibility` → `gender`, legacy `avg_distance_meters` values → semantic `avg_distance_yards` without numeric conversion because the historical UI already captured yards).
7. Load parent tables before children inside an isolated staging import process.
8. Compare row counts, required-null counts, uniqueness checks, score totals, standings, round locks, audit histories, and orphan queries.
9. Store the mapping artifacts encrypted with restricted operator access; they are migration records, not application assets.

## 5. Finish every runtime consumer

Use `docs/DAL_CUTOVER_MATRIX.md` as the checklist. Each migrated Server Action must re-authenticate, authorize, validate untrusted input, and scope the operation by `course_id`/`league_id`. Multi-row mutations belong in reviewed database functions with fixed empty `search_path` and explicit execute grants.

Before exit, this search must return only local-preview, migration, backup, and test tooling:

```bash
rg -n "lib/database|db\.prepare" app lib
```

## 6. Staging acceptance

- Owner onboarding and first league creation
- Login, recovery, invitation delivery/acceptance/expiry/revocation
- Owner protection, role changes, removal, and course switching
- Course/tee/hole setup, roster, fixtures, rainout, rapid entry, attestation, reconciliation, lock, correction, and standings
- Player registration, PIN reset/upgrade, session expiry, live score, dispute, and profile
- Public link issue/rotation/revocation for standings, TV, join, and player access
- CSV/iCalendar/QR/report authorization
- Mobile, keyboard, screen-reader, print, and clubhouse-display QA
- Backup plus timed restore into a separate project

## 7. Production cutover

1. Announce and begin the maintenance window.
2. Stop all SQLite writes.
3. Take and hash the final SQLite backup.
4. Import using the already rehearsed conversion artifacts and procedure.
5. Run integrity, count, tenant-isolation, and business-total comparisons.
6. Deploy the immutable build with `BIRVO_DATA_BACKEND=supabase`.
7. Set `BIRVO_SUPABASE_CUTOVER_COMPLETE=true` only after every exit check is signed off.
8. Run smoke tests with separate owner, staff, scorekeeper, and player accounts.
9. Monitor authentication, RLS denials, RPC failures, score corrections, latency, and error rates.

## 8. Rollback

Rollback means routing traffic back to the pre-cutover immutable deployment and restoring the pre-cutover data state under a new maintenance window. Do not toggle back to SQLite after PostgreSQL has accepted writes; that would create two divergent sources of truth. Preserve all failed-import logs and database snapshots for diagnosis.
