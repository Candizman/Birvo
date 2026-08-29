# SQLite Runtime Removal

Last measured: August 29, 2026

This document replaces the root-level `cleanup_plan.md`, whose counts were wrong (it listed 24 files; the real number is 39). Every list below was generated from the codebase, not from memory.

## Decision

Birvo will run on **PostgreSQL/Supabase only**. The dual-backend design — every feature written twice, dispatched through `if (resolveDataBackend() === DATA_BACKENDS.SUPABASE)` — doubles the cost of every change and is the direct cause of the broken build repaired on August 29, 2026.

SQLite may remain in migration tooling and historical test fixtures. It must not remain in the request path.

## Exit rule

```bash
grep -rl "lib/database" app/     # must return nothing
grep -rl "db.prepare" lib/services/   # must return nothing
```

Additionally, `BIRVO_DATA_BACKEND` and `BIRVO_SUPABASE_CUTOVER_COMPLETE` must be deleted from the code and from `.env.example`. A feature flag that only ever has one valid value is dead weight.

## Prerequisite

Do not start this work until the PostgreSQL schema has actually been applied and the pgTAP plus two-tenant isolation suites pass. Removing the SQLite path before the Supabase path is proven leaves no working backend at all.

## Route and action files still importing `lib/database` (39)

### Admin — management
- `app/admin/layout.js`
- `app/admin/course/page.js`
- `app/admin/course/actions.js`
- `app/admin/settings/actions.js`
- `app/admin/publishing/page.js`
- `app/admin/publishing/actions.js`
- `app/admin/cart-signs/page.js`
- `app/admin/season-end/page.js`
- `app/admin/season-end/actions.js`
- `app/admin/trash/page.js`
- `app/admin/trash/actions.js`
- `app/admin/billing/page.js`
- `app/admin/billing/actions.js`

### Admin — scoring
- `app/admin/fixtures/actions.js`
- `app/admin/rapid-entry/actions.js`
- `app/admin/corrections/actions.js`
- `app/admin/reconciliation/page.js`
- `app/admin/reconciliation/actions.js`
- `app/admin/handicaps/page.js`
- `app/admin/handicaps/actions.js`
- `app/admin/roster-import/actions.js`

### Player and public
- `app/player/login/page.js`
- `app/player/login/actions.js`
- `app/player/login/forgot-pin/page.js`
- `app/player/profile/page.js`
- `app/player/profile/actions.js`
- `app/join/[leagueId]/page.js`
- `app/join/[leagueId]/actions.js`
- `app/standings/page.js`
- `app/tv/[leagueId]/page.js`

### Auth and API
- `app/login/actions.js`
- `app/onboarding/actions.js`
- `app/forgot-password/actions.js`
- `app/account/update-password/actions.js`
- `app/super-admin/page.js`
- `app/api/health/route.js`
- `app/api/qr/route.js`
- `app/api/calendar/[leagueId]/route.js`
- `app/api/cron/purge-trash/route.js`

## Services still calling `db.prepare` (30)

`auditService`, `billingService`, `cartSignsService`, `correctionsService`, `courseService`, `courseSetupService`, `dashboardService`, `fixtureService`, `ghostManagementService`, `handicapService`, `healthService`, `leagueService`, `liveScoringService`, `membershipService`, `onboardingService`, `operationsService`, `playerService`, `publicLinkService`, `reconciliationService`, `reportService`, `rosterImportService`, `roundLifecycleService`, `scoreCorrectionService`, `scoreService`, `seasonEndService`, `standingsService`, `superAdminService`, `trashService`, `tvService`, `weatherService`

Each of these holds a backend branch. Removing the branch, not just the import, is what completes the row.

## Related cleanup

Over twenty Server Components use inline `require()` to lazily pull services in and avoid a top-level SQLite import. Once SQLite is gone the workaround has no purpose; convert them to normal top-level `import` statements. `app/player/page.js` was converted on August 29, 2026 as part of the build repair and is the reference for the pattern.

## Status

Not started. Blocked on the PostgreSQL schema being executed and verified.
