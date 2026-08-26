# Birvo PostgreSQL DAL Cutover Matrix

Last reviewed: August 26, 2026

This matrix is the production gate for removing the local SQLite runtime. A row is **complete** only when its reads and writes use the Supabase repositories/RPCs, UUIDs are preserved end to end, tenant tests exist, and the flow has passed staging QA. An adapter or migration alone is not completion.

## Completed application slices

| Slice | Read path | Mutation path | Verification | Status |
|---|---|---|---|---|
| Backend selection | Explicit `BIRVO_DATA_BACKEND`; production rejects SQLite and a closed cutover gate | N/A | Node contract tests | Complete |
| Admin workspace context | Supabase memberships, courses relation, active leagues | Course/league switch cookies preserve UUIDs | Repository tests | Complete |
| Tenant onboarding | Membership check through Supabase | `create_tenant_workspace` atomic RPC | Static RPC contract; staging pending | Code complete |
| Admin login and recovery limits | Supabase Auth | Service-only `consume_rate_limit` RPC using hashed subjects | Repository tests | Code complete |
| Invitation acceptance | Matching-email invitation query under RLS | `accept_course_invitation` RPC | pgTAP/staging pending | Code complete |
| Staff access mutations | Existing UI read remains SQLite | Invite, delivery state, role update, removal, and revocation RPCs | Static RPC contract; staging pending | Mutation complete only |
| Rapid score entry | Supabase setup/teams/round query | `save_score_batch` atomic RPC | Repository + contract tests; staging pending | Code complete |
| Admin shell and dashboard | Course, active league, setup, standings, reconciliation, recent scores, and navigation link versions use course-and-league-scoped repositories | N/A | Cross-tenant repository tests; staging pending | Code complete |
| Course management | Course profile, Main Course holes, yard-only tee ratings, staff/invitations, and current-week tee times use scoped repositories | Profile, 18-hole batch, tee upsert/delete, default layout, staff access, and shotgun generation use audited atomic RPCs | Repository + RPC contract; pgTAP/staging pending | Code complete |
| League and fixture operations | League list/detail, active teams, playoff standings input, fixtures, substitutes, current-week RSVPs, actual tee times, actual hole assignments, and iCalendar data use course-and-league-scoped repositories | League creation/format, playoff bracket, fixture replacement, substitute, RSVP, and rainout rescheduling use audited atomic RPCs; the SQLite preview path uses matching transactional/audited services | Repository, RPC contract, round-robin, iCalendar, rainout, and local tenant-boundary tests; pgTAP/staging pending | Code complete |
| Health/readiness | Service-only `app_metadata` schema marker; no tenant query | N/A | Node contract tests; staging pending | Code complete |
| Round close | Settings readiness uses course-and-league-scoped Supabase reads and the shared readiness calculator | `lock_round_and_advance` RPC | Repository + static RPC contract; staging pending | Code complete |
| Score corrections | Corrections page list remains SQLite | Request/review RPCs | Static RPC contract; staging pending | Mutation complete only |
| Public-link management | Admin token versions and generated URLs use one course-and-league-scoped Supabase query; public validation checks version and revocation | `rotate_public_link` RPC | Repository + static RPC contract; staging pending | Code complete |
| Public join | Service-only public-link version/revocation validation and active league/course context | Rate-limited `register_player_team` RPC; only the scrypt hash crosses the DAL | Repository + RPC contract tests; staging pending | Code complete |
| Player login and core portal | UUID-safe PIN lookup, session team/home, fixtures, tee time, profile, bag, notes, scorecard, and score history repositories | PIN upgrade, gross score, complete hole scorecard, opponent attestation, profile, bag, and note RPCs | Repository + RPC contract tests; staging pending | Code complete |
| Public standings and Clubhouse TV | Signed-link validation uses service-owned version/revocation checks; standings, display settings, sponsors, teams, rounds, and scores use derived course-and-league scopes | TV settings, partner add/delete, and explicit ghost scores use audited atomic RPCs; SQLite preview uses matching tenant-scoped transactions | Cross-tenant repository tests, RPC contracts, local ghost invariants, and 390px/1440px browser QA; pgTAP/staging pending | Code complete |
| Player extensions | Player PIN reset flow uses secure `team_pin_resets` tokens via email; stored PIN hashes remain server-only | `request_team_pin_reset`, `execute_team_pin_reset`, and `submit_score_dispute` use audited RPCs; `player_badges` awarded automatically via PostgreSQL triggers | Repository + RPC contract tests; pgTAP/staging pending | Code complete |
| Reports and downloads | Read operations for difficulty stats, heatmaps, form trends, and weekly digests are routed via `reportRepository.js` | Authorized CSV export generation runs over Supabase; formula escaping is strictly retained in the Node abstraction boundary | Repository tests; pgTAP/staging pending | Code complete |
| Roster import | Parses `.csv` and `.xlsx` files securely in Node into JSON arrays | `preview_roster_import` and `commit_roster_import` RPCs handle atomic inserts; stored PIN hashes generated server-side | Repository tests; pgTAP/staging pending | Code complete |
| Reconciliation | Reads list of pending score reviews via `reconciliationRepository.js` | `resolve_score` and `delete_disputed_score` RPCs enforce locked round invariants and recalculate simple handicaps atomically | Repository tests; pgTAP/staging pending | Code complete |
| Handicaps | Read operations for team handicap lists and audit logs routed via `handicapRepository.js` | `adjust_handicap_manually` handles transactional updates and audit logging; UI stripped of fake WHS claims to match Simple League formula | Repository tests; pgTAP/staging pending | Code complete |
| Cart signs | Course, league, teams, tee-time, and fixture reads abstracted through `cartSignsRepository.js` | Read-only view; no mutations required for cart signs | Repository tests; pgTAP/staging pending | Code complete |

## Open runtime consumers

These rows keep `BIRVO_SUPABASE_CUTOVER_COMPLETE=false`.

| Priority | Slice | Remaining work |
|---:|---|---|
| P1 | Trash | Move soft-delete/restore and add scheduled permanent deletion with integrity checks. |
| P1 | Super admin | Replace global SQLite queries with server-only, platform-admin-checked operations. |
| P2 | Billing draft | Move read-only commercial records only after pricing and Stripe decisions; keep writes disabled. |

## Exit rule

Run a repository search before opening the gate. Runtime code under `app/` must have no imports of `lib/database`, and production-reachable services must not call `db.prepare`. Migration, backup, and local-preview tooling may continue to use SQLite.

The final gate requires all pgTAP tests, application tests, staging identity flows, two-tenant adversarial tests, and a restore drill to pass. Do not use dual writes as a shortcut.
