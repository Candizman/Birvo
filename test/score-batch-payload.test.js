/**
 * What actually reaches save_score_batch.
 *
 * saveScoreBatch rebuilds every entry rather than forwarding it, so a caller
 * cannot smuggle arbitrary keys into the batch. The cost of that is a field the
 * map does not mention is dropped in silence: the database never sees it, no
 * error is raised anywhere, and the feature simply does not work.
 *
 * That is not hypothetical. Hole-by-hole entry shipped with the RPC accepting a
 * `holes` array and the screen collecting one, and the repository quietly
 * discarding it in between. These assertions exist so the next field added has to
 * survive the trip.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const operationsRepository = require('../lib/data/supabase/operationsRepository');

const COURSE = '11111111-1111-4111-8111-111111111111';
const LEAGUE = '22222222-2222-4222-8222-222222222222';
const TEAM = '33333333-3333-4333-8333-333333333333';
const SUB = '44444444-4444-4444-8444-444444444444';

// Captures the parameters the repository hands to PostgreSQL.
function recordingClient() {
  const calls = [];
  return {
    calls,
    rpc: async (functionName, parameters) => {
      calls.push({ functionName, parameters });
      return { data: { savedCount: 1 }, error: null };
    },
  };
}

async function saveAndCapture(scores) {
  const client = recordingClient();
  await operationsRepository.saveScoreBatch(client, {
    courseId: COURSE, leagueId: LEAGUE, weekNumber: 1, scores,
  });
  return client.calls[0].parameters.p_scores;
}

test('Every field the batch understands survives the trip to PostgreSQL', async t => {
  await t.test('a plain total is sent as before', async () => {
    const sent = await saveAndCapture([{ teamId: TEAM, grossScore: 84 }]);
    assert.deepStrictEqual(sent, [{ teamId: TEAM, grossScore: 84 }]);
  });

  await t.test('a hole-by-hole card is not dropped on the way', async () => {
    const holes = [
      { holeNumber: 1, grossScore: 5 },
      { holeNumber: 2, grossScore: 4 },
    ];
    const sent = await saveAndCapture([{ teamId: TEAM, holes }]);
    assert.deepStrictEqual(sent[0].holes, holes);
  });

  await t.test('hole values are sent as numbers even when the form gave strings', async () => {
    const sent = await saveAndCapture([
      { teamId: TEAM, holes: [{ holeNumber: '3', grossScore: '6' }] },
    ]);
    assert.deepStrictEqual(sent[0].holes, [{ holeNumber: 3, grossScore: 6 }]);
  });

  await t.test('a substitute is not dropped on the way', async () => {
    const sent = await saveAndCapture([{ teamId: TEAM, grossScore: 84, substituteId: SUB }]);
    assert.strictEqual(sent[0].substituteId, SUB);
  });

  await t.test('a card can carry a total, its holes, and a substitute at once', async () => {
    const sent = await saveAndCapture([{
      teamId: TEAM,
      grossScore: 9,
      substituteId: SUB,
      holes: [{ holeNumber: 1, grossScore: 4 }, { holeNumber: 2, grossScore: 5 }],
    }]);
    assert.strictEqual(sent[0].grossScore, 9);
    assert.strictEqual(sent[0].substituteId, SUB);
    assert.strictEqual(sent[0].holes.length, 2);
  });

  await t.test('a card with no total omits the field rather than sending null', async () => {
    const sent = await saveAndCapture([
      { teamId: TEAM, holes: [{ holeNumber: 1, grossScore: 4 }] },
    ]);
    assert.ok(!('grossScore' in sent[0]),
      'grossScore must be absent so the database derives it from the holes');
  });

  await t.test('a malformed identifier is refused rather than passed through', async () => {
    await assert.rejects(
      () => saveAndCapture([{ teamId: TEAM, grossScore: 84, substituteId: 'not-a-uuid' }]),
      'an unparseable substitute id must not reach the database'
    );
  });
});
