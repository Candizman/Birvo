/**
 * The money side of a league: season dues and what a skins pot is worth.
 *
 * These are pure arithmetic over a ledger an admin marks by hand -- no payment
 * ever moves -- so the contract worth pinning is what a waived team does to
 * the total owed, and how a skins pot's dollars follow its skin counts.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { summarizeDues, attachSkinsMoney } = require('../lib/domain/treasury');

test('summarizeDues', async t => {
  const teams = [
    { id: 't1', dues_status: 'paid' },
    { id: 't2', dues_status: 'unpaid' },
    { id: 't3', dues_status: 'waived' },
  ];

  await t.test('a waived team is removed from what is owed, not counted as delinquent', () => {
    const summary = summarizeDues(teams, 5000);
    assert.strictEqual(summary.billableCount, 2);
    assert.strictEqual(summary.waivedCount, 1);
    assert.strictEqual(summary.totalDueCents, 10000);
  });

  await t.test('collected is the paid count times the due amount', () => {
    const summary = summarizeDues(teams, 5000);
    assert.strictEqual(summary.paidCount, 1);
    assert.strictEqual(summary.totalCollectedCents, 5000);
  });

  await t.test('no teams means nothing owed and nothing collected', () => {
    const summary = summarizeDues([], 5000);
    assert.strictEqual(summary.totalDueCents, 0);
    assert.strictEqual(summary.totalCollectedCents, 0);
  });
});

test('attachSkinsMoney', async t => {
  const sideGame = {
    type: 'skins',
    winners: [{ teamId: 't1', name: 'Eagles', skins: 2 }, { teamId: 't2', name: 'Birdies', skins: 1 }],
    carriedOver: 1,
  };

  await t.test('the pot is the entry fee times the teams that posted a card', () => {
    const result = attachSkinsMoney(sideGame, { entryFeeCents: 500, teamsCount: 10, holesCount: 9 });
    assert.strictEqual(result.potCents, 5000);
  });

  await t.test('each skin is worth an equal share of the pot across the holes in play', () => {
    const result = attachSkinsMoney(sideGame, { entryFeeCents: 500, teamsCount: 10, holesCount: 9 });
    // 5000 / 9 holes = 555 (floored), so two skins pay 1110.
    assert.strictEqual(result.valuePerSkinCents, 555);
    assert.strictEqual(result.winners.find(w => w.teamId === 't1').payoutCents, 1110);
    assert.strictEqual(result.winners.find(w => w.teamId === 't2').payoutCents, 555);
  });

  await t.test('an unclaimed skin carries its dollar share the same way it carries its count', () => {
    const result = attachSkinsMoney(sideGame, { entryFeeCents: 500, teamsCount: 10, holesCount: 9 });
    assert.strictEqual(result.carriedOverCents, 555);
  });

  await t.test('a league with no entry fee gets counts back untouched', () => {
    const result = attachSkinsMoney(sideGame, { entryFeeCents: 0, teamsCount: 10, holesCount: 9 });
    assert.strictEqual(result, sideGame);
    assert.strictEqual(result.potCents, undefined);
  });

  await t.test('a nassau side game is untouched -- skins money does not apply to it', () => {
    const nassau = { type: 'nassau', matches: [] };
    assert.strictEqual(attachSkinsMoney(nassau, { entryFeeCents: 500, teamsCount: 10, holesCount: 9 }), nassau);
  });

  await t.test('a null side game (no complete cards this week) passes through', () => {
    assert.strictEqual(attachSkinsMoney(null, { entryFeeCents: 500, teamsCount: 10, holesCount: 9 }), null);
  });
});
