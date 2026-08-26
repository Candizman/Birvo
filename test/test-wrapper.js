const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dbPath = path.join(process.cwd(), 'birvo.db');
const getDbState = () => {
  if (fs.existsSync(dbPath)) {
    const stat = fs.statSync(dbPath);
    // return hash/size/mtime string to represent state
    return `${stat.size}-${stat.mtimeMs}`;
  }
  return 'not_exists';
};

const stateBefore = getDbState();
console.log('--- TEST ISOLATION WRAPPER ---');
console.log('DB State Before:', stateBefore);

const result = spawnSync('node', ['--test', 'test/db.test.js', 'test/domain.test.js', 'test/e2e-simulation.test.js', 'test/security.test.js', 'test/onboarding.test.js', 'test/production-readiness.test.js', 'test/platform-shell.test.js', 'test/postgres-contract.test.js'], {
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test' }
});

const stateAfter = getDbState();
console.log('DB State After:', stateAfter);

if (stateBefore !== stateAfter) {
  console.error('FAIL: Test isolation broken! birvo.db was modified during tests.');
  process.exit(1);
}

console.log('PASS: birvo.db was not touched.');
process.exit(result.status);
