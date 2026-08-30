/**
 * The extra data a hole-by-hole league format needs.
 *
 * Standings are built in three places -- the admin dashboard, the public
 * standings and TV snapshot, and the league standings read used by the player
 * portal. All three call the same pure builder, so all three have to hand it the
 * same inputs or the same league is scored differently depending on who is
 * looking at it.
 *
 * Stroke play and scramble need nothing beyond the totals, so for those this
 * returns empty arrays without issuing a query.
 */
'use strict';

const { getFormatDefinition } = require('../../domain/leagueFormats');
const { unwrapSupabaseResult } = require('./errors');

const EMPTY = { holeScores: [], fixtures: [], courseHoles: [] };

async function fetchFormatInputs(client, { courseId, leagueId, league, scores = [], courseHoles = null }) {
  if (!getFormatDefinition(league?.game_format).needsHoleScores) return EMPTY;

  const scoreIds = scores.map(score => score.id).filter(Boolean);
  const [holeResult, fixtureResult, holesResult] = await Promise.all([
    scoreIds.length > 0
      ? client.from('score_hole_details')
          .select('score_id,hole_number,gross_score')
          .eq('course_id', courseId).in('score_id', scoreIds)
      : Promise.resolve({ data: [], error: null }),
    client.from('match_fixtures')
      .select('week_number,team1_id,team2_id,is_bye')
      .eq('course_id', courseId).eq('league_id', leagueId),
    courseHoles
      ? Promise.resolve({ data: courseHoles, error: null })
      : client.from('course_holes')
          .select('hole_number,par,stroke_index')
          .eq('course_id', courseId).order('hole_number', { ascending: true }),
  ]);

  return {
    holeScores: unwrapSupabaseResult(holeResult, 'read standings hole scores') || [],
    fixtures: unwrapSupabaseResult(fixtureResult, 'read standings fixtures') || [],
    courseHoles: unwrapSupabaseResult(holesResult, 'read standings course holes') || [],
  };
}

module.exports = { fetchFormatInputs };
