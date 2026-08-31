/**
 * The money side of a league: season dues and what a skins pot is worth.
 *
 * Birvo does not move money -- Stripe stays unconfigured on purpose (see
 * lib/services/billingService.js) -- so this is arithmetic over a ledger an
 * admin marks by hand, not a payment flow. It is kept separate from
 * leagueFormats.js because skinsSideGame there is unit-agnostic (a count of
 * skins); a course that runs skins for pride rather than cash should see the
 * same counts it always has.
 */
'use strict';

/**
 * How much of a league's season dues has actually come in. `waived` teams are
 * removed from what is owed rather than counted as an unpaid amount -- a
 * waived team was never going to pay, so it should not read as delinquent.
 */
function summarizeDues(teams, duesAmountCents) {
  const billable = teams.filter(team => team.dues_status !== 'waived');
  const paid = teams.filter(team => team.dues_status === 'paid');
  return {
    duesAmountCents,
    billableCount: billable.length,
    paidCount: paid.length,
    waivedCount: teams.length - billable.length,
    totalDueCents: billable.length * duesAmountCents,
    totalCollectedCents: paid.length * duesAmountCents,
  };
}

/**
 * Turns a skins side game's counts into dollars. The pot is the entry fee
 * times the teams that actually posted a card that week, split evenly across
 * the holes in play -- each hole is one skin, so each skin is worth an equal
 * share of the pot regardless of how many end up won outright. A hole that
 * carried over (see leagueFormats.js) carries its dollar share too; Birvo
 * reports that it is unclaimed rather than deciding what a course does with it.
 */
function attachSkinsMoney(sideGame, { entryFeeCents, teamsCount, holesCount }) {
  if (!sideGame || sideGame.type !== 'skins') return sideGame;
  if (!entryFeeCents || !teamsCount || !holesCount) return sideGame;

  const potCents = entryFeeCents * teamsCount;
  const valuePerSkinCents = Math.floor(potCents / holesCount);

  return {
    ...sideGame,
    potCents,
    valuePerSkinCents,
    winners: sideGame.winners.map(winner => ({
      ...winner,
      payoutCents: winner.skins * valuePerSkinCents,
    })),
    carriedOverCents: sideGame.carriedOver * valuePerSkinCents,
  };
}

module.exports = { summarizeDues, attachSkinsMoney };
