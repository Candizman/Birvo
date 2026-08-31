/**
 * Whole-application invariants that are cheaper to assert against the source
 * than to reproduce at runtime: workspace selection, the shape of the health and
 * QR routes, accessibility affordances, and — since the PostgreSQL cutover — the
 * absence of any SQLite in the request path.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { selectLeagueForWorkspace } = require('../lib/services/workspaceSelectionService');

const read = relativePath => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

test('Platform shell and workspace safety', async t => {
  await t.test('league selection accepts only an ID present in the active course list', () => {
    const leagues = [{ id: 11, name: 'Monday' }, { id: 22, name: 'Thursday' }];
    assert.equal(selectLeagueForWorkspace(leagues, '22').id, 22);
    assert.equal(selectLeagueForWorkspace(leagues, '999').id, 11);
    assert.equal(selectLeagueForWorkspace(leagues, null).id, 11);
    assert.equal(selectLeagueForWorkspace([], '22'), null);
  });

  await t.test('league selection works with UUID identifiers', () => {
    const leagues = [{ id: 'league-a' }, { id: 'league-b' }];
    assert.equal(selectLeagueForWorkspace(leagues, 'league-b').id, 'league-b');
  });

  await t.test('no route, action, or service reaches SQLite', () => {
    const offenders = [...walk('app'), ...walk('lib')]
      .filter(file => {
        const src = read(file);
        return /require\(['"][^'"]*\/database['"]\)|from ['"][^'"]*\/database['"]/.test(src)
          || /\bdb\.prepare\(/.test(src);
      });
    assert.deepEqual(offenders, [], 'SQLite must not appear in the request path');
  });

  await t.test('the data-backend feature flag is gone', () => {
    const offenders = [...walk('app'), ...walk('lib')]
      .filter(file => /resolveDataBackend|DATA_BACKENDS|BIRVO_DATA_BACKEND|BIRVO_SUPABASE_CUTOVER_COMPLETE/.test(read(file)));
    assert.deepEqual(offenders, [], 'a flag with one valid value is dead weight');
  });

  await t.test('health route is dynamic, no-store, and leaks no tenant identifiers', () => {
    const route = read('app/api/health/route.js');
    assert.match(route, /dynamic\s*=\s*'force-dynamic'/);
    assert.match(route, /no-store/);
    assert.doesNotMatch(route, /course_id|league_id|user_id/i);
    assert.match(route, /getSupabaseHealthSnapshot/);
  });

  await t.test('QR generation stays on the Birvo server', () => {
    const route = read('app/api/qr/route.js');
    assert.match(route, /QRCode\.toBuffer/);
    assert.match(route, /private, no-store/);
    assert.doesNotMatch(route, /api\.qrserver\.com|quickchart\.io/i);
    assert.match(route, /validatePublicLeagueAccess/, 'the QR link is gated by a signed public token');
  });

  await t.test('the tenant foundation migration enables RLS and installs the cross-tenant guards', () => {
    const sql = read('supabase/migrations/202608240001_birvo_tenant_foundation.sql');
    for (const table of ['courses', 'course_memberships', 'course_invitations', 'leagues', 'teams', 'matches', 'scores', 'audit_events', 'roster_imports']) {
      assert.match(
        sql,
        new RegExp(`alter table public\\.${table} enable row level security|array\\[[^\\]]*'${table}'`, 'i'),
        table
      );
    }
    assert.match(sql, /ensure_tenant_consistency/);
    assert.match(sql, /prevent_locked_score_change/);
    assert.match(sql, /accept_course_invitation/);
    assert.match(sql, /revoke all on public/);
  });

  await t.test('every function granted to anon or authenticated is re-granted deliberately', () => {
    const lockdown = read('supabase/migrations/202608290001_birvo_function_privilege_lockdown.sql');
    assert.match(lockdown, /revoke execute on all functions in schema public from public, anon, authenticated/);
    // The service-role-only operations must never be granted to a browser key.
    for (const fn of ['trash_league', 'purge_expired_trash', 'resolve_score', 'execute_team_pin_reset', 'adjust_handicap_manually']) {
      assert.doesNotMatch(
        lockdown,
        new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to authenticated`),
        `${fn} is server-mediated only`
      );
    }
  });

  await t.test('critical route segments provide loading and recoverable error UI', () => {
    for (const segment of ['admin', 'player', 'standings']) {
      assert.equal(fs.existsSync(path.join(process.cwd(), `app/${segment}/loading.js`)), true, segment);
      const errorBoundary = read(`app/${segment}/error.js`);
      assert.match(errorBoundary, /'use client'/);
      assert.match(errorBoundary, /retry/);
    }
    assert.equal(fs.existsSync(path.join(process.cwd(), 'app/global-error.js')), true);
  });

  await t.test('keyboard accessibility includes skip navigation and trapped dialogs', () => {
    assert.match(read('app/layout.js'), /Skip to main content/);
    assert.match(read('app/layout.js'), /id="main-content"/);
    const focusHook = read('components/ui/useDialogFocus.js');
    assert.match(focusHook, /event\.key !== 'Tab'/);
    assert.match(read('components/ui/Modal.jsx'), /aria-modal="true"/);
    assert.match(read('components/ui/Drawer.jsx'), /aria-modal="true"/);
  });
});
