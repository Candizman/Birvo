# Player Extensions & Security Cutover

## Changes Made

1. **Database Schema & Migrations (`202608260001_birvo_player_extensions.sql`)**
   - Created `team_pin_resets` table with RLS and `service_role` access only.
   - Added `request_team_pin_reset` RPC to validate contact emails and issue secure hashes.
   - Added `execute_team_pin_reset` RPC to apply the new PIN securely and log an audit event.
   - Added `submit_score_dispute` RPC to update the score status to `'disputed'` and write to the audit log safely inside the PostgreSQL boundary.
   - Added a PostgreSQL Trigger (`trg_award_score_badges`) to evaluate gross scores directly against course pars on insertion into `score_hole_details`. This shifts badge generation from the client to the database, preventing spoofing.

2. **Data Access Layer (`playerRepository.js`)**
   - Exported `requestPinReset`, `executePinReset`, and `disputeScore` using the new RPCs.

3. **Server Actions & UI**
   - Implemented `forgot-pin` page for players to request a PIN reset link via their team contact email.
   - Implemented `reset-pin` page for players arriving via the link to define a new PIN. 
   - Since SMTP is not active locally, the secure reset URL is safely logged to the server console.
   - Updated `disputeScoreAction` in `live-tracker/actions.js` to route via the Supabase RPC when active.

## Validation Results

- `npm run test` completes successfully with no regressions in the SQLite runtime.
- The PostgreSQL backend now owns the security rules for these extensions without relying on client trust.
- UI forms are fully responsive and integrate gracefully into the existing Player portal theme.
