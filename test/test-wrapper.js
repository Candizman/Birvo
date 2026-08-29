/**
 * Runs the Node test suite.
 *
 * This used to also guard birvo.db against accidental writes during tests. That
 * check is gone with the SQLite runtime: nothing under app/ or lib/ can open a
 * SQLite file any more, and test/platform-shell.test.js asserts that directly.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testDir = path.join(__dirname);
const files = fs.readdirSync(testDir)
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => path.join('test', name));

if (files.length === 0) {
  console.error('No test files found in test/.');
  process.exit(1);
}

const result = spawnSync('node', ['--test', ...files], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' },
});

process.exit(result.status ?? 1);
