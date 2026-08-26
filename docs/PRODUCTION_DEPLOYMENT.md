# Birvo Production Deployment Gates

Birvo is not approved for a horizontally scaled SaaS deployment yet. The local product is a verified single-server pilot. The PostgreSQL schema, RPC, repository boundary, and database tests are ready for staging, but the runtime cutover matrix is not complete.

## Gate 1 — Centralized data access

- Create separate Supabase projects for staging and production.
- Apply all three versioned files in `supabase/migrations` to local PostgreSQL and then staging through the Supabase CLI migration workflow.
- Run `supabase test db`; the pgTAP schema-contract and adversarial tenant-isolation suites must pass.
- Replace SQLite queries with a PostgreSQL/Supabase DAL. Do not run SQLite and PostgreSQL as dual writers.
- Define an explicit ID migration map because SQLite uses integer course/league/team/score IDs and PostgreSQL uses UUIDs.
- Move every course-scoped read and write behind the authenticated Supabase client or an audited server-only operation.
- Run two-tenant adversarial tests for every table: Tenant A must never read, create, update, delete, reference, or infer Tenant B records.
- Verify that anon has no table grants and authenticated users cannot write memberships, invitations, audit events, or link versions directly.
- Complete every row in `docs/DAL_CUTOVER_MATRIX.md`; keep `BIRVO_SUPABASE_CUTOVER_COMPLETE=false` until sign-off.

Exit condition: the application runs with no writable local database and all tenant-isolation tests pass in staging.

## Gate 2 — Identity and email

- Configure the Supabase Site URL and allow redirects to `/auth/confirm` on staging and production domains only.
- Configure a production SMTP provider with SPF, DKIM, and DMARC for the Birvo sending domain.
- Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SECRET_KEY` in the deployment environment.
- Confirm invitation links set a password, accept only the matching email, create one durable membership, and cannot be replayed after acceptance/revocation/expiry.
- Confirm password recovery returns the same UI response for existing and unknown emails.
- Test role downgrade, staff removal, multi-course switching, expired invitation, suspended membership, and last-owner protection.

Exit condition: identity lifecycle tests pass using real delivered emails in staging, with no secret or authorization data in user metadata.

## Gate 3 — Secrets and public access

- Generate independent 32-byte-or-longer random values for `PLAYER_SESSION_SECRET` and `PUBLIC_LINK_SECRET`.
- Confirm cookies are Secure, HttpOnly, SameSite=Lax, and scoped to the narrowest practical path.
- Rotate standings, TV, and player links in staging and verify every previous URL fails immediately.
- Verify `/api/qr` returns a local `image/png` response with `Cache-Control: private, no-store` and makes no third-party QR request.
- Verify login, password, and invitation rate limits use the service-only PostgreSQL function across multiple instances.

Exit condition: rotation, expiry, tampering, replay, and rate-limit tests pass across multiple application instances.

## Gate 4 — Operations

- Add structured logs with request IDs, tenant IDs, actor IDs, action names, and redacted error metadata.
- Connect error monitoring and alerts for auth failures, invitation-provider failures, RLS denials, migration failures, and score-correction spikes.
- Automate encrypted backups, document retention, and perform a timed restore drill into an isolated project.
- `GET /api/health` verifies the active SQLite connection and schema v17 without exposing tenant data, and uses the non-tenant PostgreSQL schema marker when the Supabase backend is selected.
- Run accessibility tests, keyboard-only flows, mobile Safari/Chrome tests, and print verification on physical devices.

Exit condition: restore, incident, accessibility, and real-device QA checklists are signed off.

## Gate 5 — Commercial launch

- Complete US privacy policy, terms, data-processing/vendor review, deletion/retention policy, and security contact.
- Decide pricing, trial, cancellation, refunds, taxes, invoice rules, and webhook idempotency before connecting Stripe.
- Keep WHS/GHIN language non-authoritative unless an official integration and licensing review are complete.

Only after Gates 1–5 pass should Birvo be marketed as a production multi-tenant SaaS platform.
