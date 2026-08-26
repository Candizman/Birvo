# Birvo Engineering Status

Last updated: August 26, 2026

This file gives the next engineer or coding agent a trustworthy starting point without requiring a full repository rescan. Record only verified outcomes here.

## Completed quality work

- Replaced the copied-looking marketing page with an original Birvo brand system, responsive landing page, and admin navigation.
- Removed the fixed `courseId=1 / leagueId=1` context. Local development selects preview data dynamically and labels it as demo data; production has no implicit administrator session.
- Removed fake Stripe Live, MRR, payment-portal, rating, and user-count claims. Billing remains explicitly labeled as a product draft until a real integration exists.
- Removed PIN disclosure from team lists. New PINs use salted `scrypt` hashes, and legacy plaintext PINs upgrade after a successful sign-in.
- Added signed, expiring player sessions. Registration PINs no longer appear in URLs and are delivered through a short-lived signed receipt cookie.
- Added matchup ownership checks to player scoring, dispute, and attestation server actions.
- Added league-, purpose-, and expiration-scoped signed access tokens for standings, TV, registration, and player access.
- Secured CSV and iCalendar endpoints with administrator and tenant checks, CSV formula protection, and iCalendar text escaping.
- Added missing tenant checks to settings, playoff, and RSVP actions.
- Removed hidden database writes from course, TV, and player-profile read paths.
- Migrated the Next.js request boundary from `middleware.js` to the Next.js 16 `proxy.js` contract.
- Converted product UI, server messages, exports, tests, scripts, and engineering documentation to US English.
- Removed legacy brand identifiers from tracked source and renamed local artifacts to Birvo equivalents.
- Added schema v14 and a transactional US onboarding flow that creates the course, owner membership, and first active league as one rollback-safe operation.
- Routed authenticated users without a course membership into onboarding and protected the onboarding route in production Proxy checks.
- Centralized course-management and scoring-operation roles, enforced them inside sensitive Server Actions, and hid or blocked management-only screens for scoring staff.
- Removed the fake local-only staff account writer. Staff invitations now remain explicitly unavailable until a secure Supabase invitation flow exists.
- Separated plan selection from payment activation: Stripe remains `not_configured` until a real payment integration exists.
- Fixed the league-format runtime failure by replacing a Server Component event handler with a progressive-enhancement form submission.
- Added schema v15 with many-to-many course memberships, staff invitations, audit events, persistent rate limits, course setup state, roster import records, score correction requests, round locks, and public-link versions.
- Added a versioned Supabase/PostgreSQL tenant schema with explicit grants, RLS on every API table, cross-tenant consistency triggers, locked-score protection, last-owner protection, and audited invitation acceptance.
- Implemented Supabase staff invitation delivery, matching-email acceptance, role changes, access removal safeguards, and a multi-course switcher. Live SMTP validation still requires a configured staging project.
- Implemented password recovery, OTP/PKCE confirmation, secure password update, enumeration-resistant responses, and persistent rate limits.
- Added a six-step launch checklist and server-enforced scoring readiness gates.
- Added CSV roster preview/commit with quoted-field parsing, duplicate and invalid-row quarantine, transactional writes, and one-time PIN display after salted hashing.
- Replaced unsafe week advancement with attestation/reconciliation closeout checks, immutable round locks, audited correction requests, and manager approval/rejection.
- Added public-link version rotation and replaced the third-party QR redirect with local PNG generation.
- Forced authenticated admin, account-recovery, and super-admin routes to render per request; super-admin authorization now runs in the protected layout.
- Added a validated active-league cookie and league switcher. Forged or stale league IDs fall back inside the active course, and dashboard, settings, handicap, and correction data now honor the selected league.
- Added reusable Card, Badge, Alert, ProgressBar, and Skeleton primitives; the course readiness checklist and scoring completion now expose accessible progress semantics.
- Added route loading states and recoverable error boundaries for admin, player, and standings flows, plus a root-level recovery boundary.
- Added `GET /api/health` with no-store responses, a database probe, and versioned schema readiness verification without tenant data or database error disclosure.
- Added skip navigation, global focus visibility, reduced-motion-safe loading UI, and focus trapping/restoration for modal and drawer dialogs.
- Added an explicit fail-closed data backend boundary: production rejects SQLite, missing Supabase configuration, and an unopened cutover gate.
- Added PostgreSQL feature-parity and atomic-operation migrations covering scheduling, player, TV, commercial-read, private rate-limit, audit, score, membership, onboarding, and public-link data.
- Added UUID-compatible player/public tokens and workspace-switch actions while retaining numeric compatibility for local preview data.
- Added Supabase repositories for workspace reads, onboarding, scoring readiness, score batches, round lock, corrections, staff access, public-link rotation, invitation acceptance, and service-only persistent rate limiting.
- Migrated the production branches of login, password recovery/update, onboarding, admin workspace context, rapid score entry, critical score operations, and staff-access mutations away from SQLite.
- Added pgTAP schema/grant and two-tenant adversarial isolation suites plus Node repository/migration contract tests.
- Removed PIN values from rapid-entry rendering; stored PIN material is not sent to that UI.
- Added a cutover matrix and a no-dual-write staging/production runbook.
- Migrated public player-link validation, league registration, PIN login/upgrade, signed-session lookup, quick gross scoring, hole-by-hole scoring, opponent attestation, profile preferences, bag clubs, and round notes to server-owned Supabase repositories and atomic service-role RPCs.
- Corrected player matchups to read `match_fixtures` and `tee_times` instead of nonexistent team columns on `matches`; removed the fabricated default season rank.
- Removed the simulated GPS map, generated yardages, and client-only attestation success state. The player experience now presents an honest live scorecard and reports verified server outcomes.
- Standardized club carry distances on US customary yards. SQLite schema v16 preserves the historical numeric values in `avg_distance_yards`, and the PostgreSQL schema uses the same semantic field.
- Made SQLite migration execution backup-first and added post-migration integrity and foreign-key verification.
- Migrated the admin layout, dashboard, and operations-settings read paths to course-and-league-scoped Supabase repositories while retaining the local SQLite preview path.
- Reused one pure standings, setup-progress, and round-readiness calculation layer across SQLite and PostgreSQL to prevent backend-specific business-rule drift.
- Batched standings, TV, and player public-link version reads into one tenant-scoped query and added an adversarial neighboring-course dashboard test.
- Migrated course-management reads and writes to scoped Supabase repositories and six audited transactional RPCs: default layout, profile, complete 18-hole layout, tee save/delete, and current-week shotgun generation.
- Tightened server-side course validation for USGA rating ranges, unique stroke indexes, hex colors, email, tee categories, current-week scheduling, and locked-round protection.
- Removed metric values from course and clubhouse weather/tee displays. Product-facing course distance, temperature, and wind presentation now uses yards, °F, and mph for the US market.
- Migrated league and fixture management to course-and-league-scoped PostgreSQL repositories and seven audited RPCs covering league creation, format changes, playoff brackets, fixture replacement, substitutes, RSVP status, and rainout rescheduling.
- Fixed double round-robin reversal, replaced fabricated shotgun hole/par display data with configured tee-sheet and course-hole records, and standardized iCalendar output on US English labels.
- Added a responsive team RSVP editor with canonical attendance states, accessible pending/result feedback, and a server-trusted current-week boundary.
- Extracted SQLite rainout rescheduling into a transactional lifecycle service that shifts matches, fixture dates, tee times, and RSVPs together, advances the active week, and records a concrete audit target.
- Added local tenant-boundary and audit parity for schedule generation, substitute registration, and RSVP changes; corrected the SQLite team scope to derive course ownership through the league relationship.
- Translated the remaining non-English tournament-format comments and standardized the standings abbreviation as `Net Avg.`.
- Migrated signed public standings and Clubhouse TV reads to service-owned Supabase repositories with derived course-and-league scoping; production no longer falls back to SQLite for these links.
- Added a manager-only Clubhouse publishing workspace for broadcast rotation, announcements, and club partners, backed by validated, audited PostgreSQL RPCs and matching transactional SQLite preview services.
- Replaced the invalid `reconciliation_status='ghost'` approach with explicit `scores.is_ghost` provenance in SQLite schema v17 and PostgreSQL schema v4. Ghost scoring now trusts the server-selected current week, rejects locked/rained-out rounds, cannot replace a real scorecard, and records the correct course audit scope.
- Added missing-scorecard management to the responsive fixture workspace and exposed ghost-score badges in weekly and season standings.
- Made Clubhouse TV responsive across phone and desktop layouts, translated its remaining non-English labels, honored the announcement visibility setting, and hid unavailable partner images without broken-image UI.

## Latest verification

- `npm test`: 109 / 109 tests passed; the isolation wrapper verified that `birvo.db` was unchanged by the test run.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 16.
- Database migration and audit: schema v17, integrity check passed, foreign key check passed, and no duplicate, incomplete, or orphan scores. Pre-migration backup: `backups/birvo-backup-2026-08-26T08-51-51-404Z.db`.
- Browser QA: Clubhouse publishing, public standings, Clubhouse TV, and missing-scorecard management passed at 390px with no document overflow. Clubhouse TV also passed at 1440px with the intended leaderboard/sidebar grid and eight visible rows. Earlier dashboard, staff access, CSV import, operations settings, password recovery, and health checks remain documented separately.
- PostgreSQL execution status: not run on this workstation because Supabase CLI, Docker, and `psql` are unavailable. The migrations and pgTAP tests must run against local PostgreSQL and staging before their results can be marked verified.

## Required before production

1. Complete every open runtime consumer in `docs/DAL_CUTOVER_MATRIX.md`, execute migrations/pgTAP on PostgreSQL, and validate every RLS policy against two adversarial staging tenants.
2. Configure staging SMTP and Supabase redirect allowlists, then validate invitation, recovery, role removal, multi-course switching, and ownership transfer end to end.
3. Add a guided ownership-transfer UI, player PIN reset flow, structured security logs, alerting, and error monitoring.
4. Connect a live weather provider and complete automated backup/restore drills.
5. Connect Stripe only after decisions for USD pricing, tax, invoicing, cancellation, refunds, and webhook idempotency are complete.
6. Complete accessibility automation and responsive QA on physical iOS Safari, Android Chrome, tablet, and print targets. The code-level keyboard foundation is present, but real-device sign-off remains open.

## Recommended next sprint

Continue the P0 rows in `docs/DAL_CUTOVER_MATRIX.md`, beginning with authorized report downloads and the remaining player-extension security flows. Do not add billing or broad product features until the production gate in `docs/PRODUCTION_DEPLOYMENT.md` is green.
