# Reports and Downloads Cutover

This plan addresses the P0 task "Reports and downloads" from the DAL Cutover Matrix. We will migrate the report generation reads (difficulty stats, heatmaps, weekly digests) and the CSV export endpoint to PostgreSQL.

## User Review Required
> [!IMPORTANT]
> The CSV export formula escaping logic (protecting against CSV injection with `=` `+` `-` `@`) will be preserved in the Node layer, exactly as it exists now, ensuring identical security and formatting.

## Open Questions
None.

## Proposed Changes

### Database Layer (Node)

#### [NEW] `lib/data/supabase/reportRepository.js`
Create a new Supabase repository implementing the following functions:
- `getCourseHoleDifficultyStats(client, courseId)`
- `getHoleHeatmap(client, courseId)`
- `getWeeklyDigest(client, leagueId, weekNumber)`
- `getPlayerFormTrend(client, teamId)`
- `getLeagueCSVData(client, leagueId)`: Fetches teams, matches, and scores in a single efficient payload.

#### [MODIFY] `lib/services/reportService.js`
- Integrate `dataBackend.resolveDataBackend()` to route calls to either Supabase or SQLite.
- Refactor `generateCSVExport` so that it calls `getLeagueCSVData(client, leagueId)` for Supabase, but still applies the `escapeCSVCell` and formats the CSV string exactly as the SQLite version does.
- Apply the same abstraction pattern to `getCourseHoleDifficultyStats`, `getWeeklyDigest`, `getHoleHeatmap`, and `getPlayerFormTrend`.

### Frontend Routes

#### [MODIFY] `app/api/reports/csv/[leagueId]/route.js`
- Ensure it properly authenticates the request and passes the `adminClient` down to `generateCSVExport` when Supabase is active.

#### [MODIFY] `app/admin/reports/page.js`
- Ensure it retrieves the `adminClient` when Supabase is active, and passes the necessary arguments to `reportService.js`.

## Verification Plan

### Automated Tests
- Run `npm run test` to verify no regressions in SQLite logic.

### Manual Verification
- Start the server.
- Visit the Reports dashboard and verify that Difficulty Stats, Heatmap, and Weekly Digest load successfully.
- Click "Export CSV" and verify the CSV file downloads successfully, formats correctly, and safely escapes names like `=SUM(...)`.
