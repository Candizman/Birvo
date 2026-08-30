/**
 * The extra column a week's table needs to explain its own points.
 *
 * Stroke play is fully described by gross, handicap and net. Stableford ranks on
 * points and match play on the fixture result, and leaving those out gives a
 * table whose points appear to come from nowhere.
 *
 * Shared by the admin dashboard and the public standings so the two cannot drift
 * into describing the same round differently.
 */
'use strict';

function weekFormatColumn(scoringBasis) {
  if (scoringBasis === 'stableford') {
    return {
      header: 'Stableford',
      value: team => (team.stablefordPoints ?? '-'),
    };
  }
  if (scoringBasis === 'match') {
    return {
      header: 'Match',
      value: team => team.matches?.map(match => match.status).join(', ') || '-',
    };
  }
  return null;
}

module.exports = { weekFormatColumn };
