const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createDatabase } = require('../lib/database/createDatabase');
const { selectLeagueForWorkspace } = require('../lib/services/workspaceSelectionService');
const { getHealthSnapshot } = require('../lib/services/healthService');

const read = relativePath => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

test('Platform shell and workspace safety', async t => {
  await t.test('league selection accepts only an ID present in the active course list', () => {
    const leagues = [{ id: 11, name: 'Monday' }, { id: 22, name: 'Thursday' }];
    assert.equal(selectLeagueForWorkspace(leagues, '22').id, 22);
    assert.equal(selectLeagueForWorkspace(leagues, '999').id, 11);
    assert.equal(selectLeagueForWorkspace(leagues, null).id, 11);
    assert.equal(selectLeagueForWorkspace([], '22'), null);
  });

  await t.test('league selection remains compatible with future UUID identifiers', () => {
    const leagues = [{ id: 'league-a' }, { id: 'league-b' }];
    assert.equal(selectLeagueForWorkspace(leagues, 'league-b').id, 'league-b');
  });

  await t.test('health snapshot reports a ready database only at the expected schema', () => {
    const db = createDatabase(':memory:');
    db.pragma('user_version = 17');
    assert.deepEqual(getHealthSnapshot(db), {
      ready: true,
      status: 'ok',
      checks: { database: 'ok', schema: 'ok' },
      schemaVersion: { current: 17, expected: 17 },
    });
    db.pragma('user_version = 15');
    const stale = getHealthSnapshot(db);
    assert.equal(stale.ready, false);
    assert.equal(stale.checks.schema, 'mismatch');
    db.close();
  });

  await t.test('health failures expose no database exception or tenant data', () => {
    const snapshot = getHealthSnapshot({ prepare() { throw new Error('secret database path'); } });
    assert.equal(snapshot.ready, false);
    assert.equal(snapshot.checks.database, 'unavailable');
    assert.doesNotMatch(JSON.stringify(snapshot), /secret|tenant|path/i);
  });

  await t.test('health route is dynamic, no-store, and contains no tenant query', () => {
    const route = read('app/api/health/route.js');
    assert.match(route, /dynamic\s*=\s*'force-dynamic'/);
    assert.match(route, /no-store/);
    assert.doesNotMatch(route, /course_id|league_id|user_id/i);
    assert.match(route, /getSupabaseHealthSnapshot/);
  });

  await t.test('admin operational pages scope data to the selected league', () => {
    assert.match(read('app/admin/page.js'), /WHERE id = \? AND course_id = \?/);
    assert.match(read('app/admin/settings/page.js'), /WHERE id = \? AND course_id = \?/);
    assert.match(read('lib/services/handicapService.js'), /WHERE t\.league_id = \?/);
    assert.match(read('app/admin/corrections/page.js'), /l\.id=\?/);
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
