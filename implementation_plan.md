# Player Extensions & Security Cutover

This plan addresses the P0 tasks for player extensions outlined in the DAL Cutover Matrix. It focuses on three key deliverables: moving score disputes to a scoped RPC, defining a server-owned badge lifecycle, and adding a player PIN reset flow.

## User Review Required
> [!IMPORTANT]
> Since Birvo currently does not have a live SMTP configuration for sending emails, the "Player self-serve via email link" will log the secure reset URL to the server console instead of sending an actual email. This allows testing the flow end-to-end without a live mail provider.

## Open Questions
None at this time.

## Proposed Changes

### PostgreSQL Migrations

#### [NEW] `supabase/migrations/202608260001_birvo_player_extensions.sql`
- Create `team_pin_resets` table (`id`, `team_id`, `token_hash`, `expires_at`, `used_at`) with RLS and `service_role` access.
- Add `request_team_pin_reset(p_team_id, p_email, p_token_hash)` RPC to securely validate the team's `contact_email` and store the reset token.
- Add `execute_team_pin_reset(p_team_id, p_token_hash, p_new_pin_hash)` RPC to validate the token and update the team's PIN hash safely.
- Add `submit_score_dispute(p_score_id, p_reason)` RPC to transition a score's `attestation_status` to `'disputed'` and insert a `score_audit_logs` record, matching the SQLite behavior but enforcing RLS and tenant boundaries.
- Define a server-side view or function `calculate_score_badges()` that evaluates `gross_score` against `course_holes.par` to award 'Eagle', 'Birdie', etc., preventing client-side spoofing of achievements.

### Database Layer (Node)

#### [MODIFY] `lib/data/supabase/playerRepository.js`
- Export `requestPinReset`, `executePinReset`, and `disputeScore` functions calling the new RPCs.

#### [MODIFY] `lib/services/liveScoringService.js`
- Update `disputeScore` to route through the active data backend boundary (`DATA_BACKENDS.SUPABASE` vs `DATA_BACKENDS.SQLITE`).

### Frontend Routes & Actions

#### [NEW] `app/player/login/forgot-pin/page.js`
- Create a UI where players can select their team and enter their `contact_email` to request a reset link.

#### [NEW] `app/player/login/forgot-pin/actions.js`
- Server action `requestTeamPinReset` that creates a token, hashes it, calls the backend, and "sends" the email (logs the URL).

#### [NEW] `app/player/reset-pin/page.js`
- UI for users arriving from the email link. It will read the `token` and `teamId` from URL params and provide a form to enter a new 4-digit PIN.

#### [NEW] `app/player/reset-pin/actions.js`
- Server action `resetTeamPin` that hashes the new PIN via `pin.js`, submits the plain token and new hash to the `execute_team_pin_reset` RPC.

#### [MODIFY] `app/player/live-tracker/actions.js`
- Ensure `disputeScoreAction` utilizes the data backend abstraction to submit the dispute via the new Supabase RPC when active.

## Verification Plan

### Automated Tests
- Create tests ensuring the `request_team_pin_reset` RPC rejects non-matching emails.
- Ensure the token hash works and expires.
- Run `npm run test` to verify no regressions in SQLite logic.

### Manual Verification
- Start the server.
- Request a PIN reset for a team.
- Copy the reset link from the console.
- Visit the link, submit a new PIN, and verify that login with the new PIN succeeds.
- Dispute a score and verify the audit logs and reconciliation status.
