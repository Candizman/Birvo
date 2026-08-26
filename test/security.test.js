const test = require('node:test');
const assert = require('node:assert/strict');
const { hashTeamPin, isHashedTeamPin, verifyTeamPin } = require('../lib/security/pin');
const {
  JOIN_RECEIPT_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  createJoinReceiptToken,
  createPlayerSessionToken,
  verifyJoinReceiptToken,
  verifyPlayerSessionToken,
} = require('../lib/playerSession');
const { createPublicAccessToken, verifyPublicAccessToken } = require('../lib/publicAccess');

test('Player security primitives', async (t) => {
  await t.test('PIN values are salted, hashed, and verifiable', () => {
    const hashed = hashTeamPin('4821');
    assert.equal(isHashedTeamPin(hashed), true);
    assert.equal(hashed.includes('4821'), false);
    assert.equal(verifyTeamPin('4821', hashed), true);
    assert.equal(verifyTeamPin('4822', hashed), false);
  });

  await t.test('legacy PIN values remain verifiable during gradual migration', () => {
    assert.equal(verifyTeamPin('1234', '1234'), true);
    assert.equal(verifyTeamPin('1235', '1234'), false);
  });

  await t.test('player sessions reject tampering and expiration', () => {
    const now = 1_700_000_000_000;
    const token = createPlayerSessionToken(42, now);
    assert.equal(verifyPlayerSessionToken(token, now + 1_000).teamId, 42);
    assert.equal(verifyPlayerSessionToken(`${token}x`, now + 1_000), null);
    assert.equal(verifyPlayerSessionToken(token, now + (SESSION_TTL_SECONDS + 1) * 1_000), null);
  });

  await t.test('player sessions support PostgreSQL UUID identifiers without weakening signatures', () => {
    const now = 1_700_000_000_000;
    const teamId = 'a56f6f4a-5eb7-4a3d-8cc0-9fd2a492690c';
    const leagueId = '4ba0ad3c-4514-4c77-b501-3b2a0cc3a730';
    const session = createPlayerSessionToken(teamId, now);
    assert.equal(verifyPlayerSessionToken(session, now + 1_000).teamId, teamId);
    const receipt = createJoinReceiptToken({ teamId, leagueId, pin: '6789' }, now);
    assert.equal(verifyJoinReceiptToken(receipt, now + 1_000).teamId, teamId);
    assert.equal(verifyJoinReceiptToken(receipt, now + 1_000).leagueId, leagueId);
  });

  await t.test('registration receipts are short-lived and signed', () => {
    const now = 1_700_000_000_000;
    const token = createJoinReceiptToken({ teamId: 7, leagueId: 3, pin: '6789', access: 'signed-public-link' }, now);
    assert.deepEqual(verifyJoinReceiptToken(token, now + 1_000), {
      teamId: 7,
      leagueId: 3,
      pin: '6789',
      access: 'signed-public-link',
      expiresAt: Math.floor(now / 1000) + JOIN_RECEIPT_TTL_SECONDS,
    });
    assert.equal(verifyJoinReceiptToken(`${token.slice(0, -1)}x`, now + 1_000), null);
    assert.equal(verifyJoinReceiptToken(token, now + (JOIN_RECEIPT_TTL_SECONDS + 1) * 1_000), null);
  });

  await t.test('public league links are scoped by league, purpose, and expiry', () => {
    const now = 1_700_000_000_000;
    const token = createPublicAccessToken({ leagueId: 3, purpose: 'standings', expiresInSeconds: 60 }, now);
    assert.equal(verifyPublicAccessToken(token, { leagueId: 3, purpose: 'standings' }, now + 1_000), true);
    assert.equal(verifyPublicAccessToken(token, { leagueId: 4, purpose: 'standings' }, now + 1_000), false);
    assert.equal(verifyPublicAccessToken(token, { leagueId: 3, purpose: 'tv' }, now + 1_000), false);
    assert.equal(verifyPublicAccessToken(token, { leagueId: 3, purpose: 'standings' }, now + 61_000), false);
  });

  await t.test('public league links support UUID league IDs and reject malformed IDs', () => {
    const now = 1_700_000_000_000;
    const leagueId = '4ba0ad3c-4514-4c77-b501-3b2a0cc3a730';
    const token = createPublicAccessToken({ leagueId, purpose: 'standings', expiresInSeconds: 60 }, now);
    assert.equal(verifyPublicAccessToken(token, { leagueId, purpose: 'standings' }, now + 1_000), true);
    assert.equal(verifyPublicAccessToken(token, { leagueId: 'not-a-uuid', purpose: 'standings' }, now + 1_000), false);
    assert.equal(createPublicAccessToken({ leagueId: '../3', purpose: 'standings' }, now), null);
  });
});
