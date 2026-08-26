# Birvo

Birvo is a multi-tenant web platform for golf courses to manage leagues, teams, schedules, scoring, and clubhouse publishing. The product is under active development; this document lists only capabilities that exist in the codebase and have been verified.

## Verified capabilities

- Course, hole, and tee-box management
- League, team, schedule, and weekly score management
- Net-score, points-table, and season-standings calculations
- Rapid score entry and a mobile player scoring experience
- Clubhouse TV standings, cart signs, and CSV/PDF report flows
- Supabase-backed administrator sessions with a clearly labeled local preview mode
- Transactional US course onboarding that creates a course owner and first league without sample data
- Server-enforced course-manager and scoring-operator role boundaries
- Multi-course memberships, secure staff invitation lifecycle, role changes, and protected owner access
- Password recovery and invite confirmation routes using Supabase SSR sessions
- Guided course-readiness checks and scoring gates
- CSV roster preview/import with duplicate quarantine and one-time hashed player PIN delivery
- Locked-round closeout, audited score correction requests, and committee approval
- Signed player sessions, hashed new PINs, versioned public links, and immediate link rotation
- Server-local QR image generation; signed join tokens are not sent to a third-party QR provider
- SQLite transactions, migrations, and isolated automated tests
- A versioned PostgreSQL/Supabase schema, atomic RPC layer, repository boundary, and pgTAP tenant-isolation contract
- UUID-safe public registration, player PIN access, live scorecards, opponent attestation, player profiles, bag yardages, and round notes through server-owned PostgreSQL operations

## Not live services yet

- Stripe billing and the customer portal are not connected. The plans screen is a product draft.
- Weather data is not connected to a live provider. Development data is labeled as a sample in the interface.
- Production deployment, centralized application data access, observability, and applicable privacy/compliance work are not complete.
- Staff invitation and password-recovery code requires a configured Supabase project, SMTP delivery, and live staging validation.
- Ownership transfer is protected at the data layer but does not yet have a dedicated guided UI.
- There is no official WHS or GHIN integration. The calculation engine must not be represented as a federation-approved or legally authoritative service.

## Local development

Requirements: a current Node.js LTS release and npm.

```bash
npm install
copy .env.example .env.local
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. When Supabase variables are empty, the admin dashboard uses a local preview context in development only and clearly labels the displayed data as demo data.

To intentionally rebuild demo data:

```bash
npm run db:seed:demo -- --force
```

This command changes the database file. Never run it against production data.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

The test command uses temporary or in-memory databases and separately verifies that the workspace `birvo.db` file was not modified. Local club carry distances use yards, matching the US target market.

## Required production environment variables

Alongside the Supabase values in `.env.example`, define two different secrets containing at least 32 random bytes:

- `PLAYER_SESSION_SECRET`: signs player sessions and short-lived registration receipts
- `PUBLIC_LINK_SECRET`: signs standings, TV, and player invitation links
- `SUPABASE_SECRET_KEY`: server-only staff invitation administration; never expose it with a `NEXT_PUBLIC_` prefix

Player sessions and public league links remain disabled in production when these secrets are missing. Rotating either secret invalidates the corresponding existing sessions or links.

## Data architecture note

Local preview and tests still use `better-sqlite3`. Production mode now fails closed unless the Supabase backend and cutover gate are explicitly enabled. Several critical slices use the new PostgreSQL repositories/RPCs, but open SQLite runtime consumers remain; do not open the gate or deploy multiple instances until the [DAL cutover matrix](./docs/DAL_CUTOVER_MATRIX.md), [cutover runbook](./docs/DATA_CUTOVER_RUNBOOK.md), and [production gates](./docs/PRODUCTION_DEPLOYMENT.md) are complete.

Copyright: proprietary commercial software.
