const { executeRpc } = require('./errors');
const { requireUuid } = require('./workspaceRepository');

function courseScope(courseId) {
  return requireUuid(courseId, 'course scope');
}

async function saveScoreBatch(client, { courseId, leagueId, weekNumber, scores }) {
  return executeRpc(client, 'save_score_batch', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_week_number: weekNumber,
    p_scores: scores.map(score => ({ teamId: requireUuid(score.teamId, 'team scope'), grossScore: score.grossScore })),
  }, 'save score batch');
}

async function lockRoundAndAdvance(client, { courseId, leagueId, weekNumber }) {
  return executeRpc(client, 'lock_round_and_advance', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_week_number: weekNumber,
  }, 'lock round and advance');
}

async function requestScoreCorrection(client, { courseId, scoreId, requestedGrossScore, reason }) {
  return executeRpc(client, 'request_score_correction', {
    p_course_id: courseScope(courseId),
    p_score_id: requireUuid(scoreId, 'score scope'),
    p_requested_gross_score: requestedGrossScore,
    p_reason: reason,
  }, 'request score correction');
}

async function reviewScoreCorrection(client, { courseId, requestId, decision, reviewNote = null }) {
  return executeRpc(client, 'review_score_correction', {
    p_course_id: courseScope(courseId),
    p_request_id: requireUuid(requestId, 'correction request scope'),
    p_decision: decision,
    p_review_note: reviewNote,
  }, 'review score correction');
}

async function rotatePublicLink(client, { courseId, leagueId, purpose }) {
  return executeRpc(client, 'rotate_public_link', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_purpose: purpose,
  }, 'rotate public link');
}

async function initializeCourseLayout(client, { courseId }) {
  return executeRpc(client, 'initialize_course_layout', {
    p_course_id: courseScope(courseId),
  }, 'initialize course layout');
}

async function updateCourseProfile(client, {
  courseId, name, address, city, contactEmail, contactPhone, primaryColor, localRules,
}) {
  return executeRpc(client, 'update_course_profile', {
    p_course_id: courseScope(courseId),
    p_name: name,
    p_address: address,
    p_city: city,
    p_contact_email: contactEmail,
    p_contact_phone: contactPhone,
    p_primary_color: primaryColor,
    p_local_rules: localRules,
  }, 'update course profile');
}

async function saveCourseHoles(client, { courseId, holes }) {
  return executeRpc(client, 'save_course_holes', {
    p_course_id: courseScope(courseId),
    p_holes: holes,
  }, 'save course holes');
}

async function upsertCourseTeeBox(client, {
  courseId, teeId = null, name, colorHex, gender, courseRating, slopeRating, totalYards,
}) {
  return executeRpc(client, 'upsert_course_tee_box', {
    p_course_id: courseScope(courseId),
    p_tee_id: teeId ? requireUuid(teeId, 'tee-box scope') : null,
    p_name: name,
    p_color_hex: colorHex,
    p_gender: gender,
    p_course_rating: courseRating,
    p_slope_rating: slopeRating,
    p_total_yards: totalYards,
  }, 'save course tee box');
}

async function deleteCourseTeeBox(client, { courseId, teeId }) {
  return executeRpc(client, 'delete_course_tee_box', {
    p_course_id: courseScope(courseId),
    p_tee_id: requireUuid(teeId, 'tee-box scope'),
  }, 'delete course tee box');
}

async function generateShotgunTeeTimes(client, { courseId, leagueId, weekNumber, startTime }) {
  return executeRpc(client, 'generate_shotgun_tee_times', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_week_number: weekNumber,
    p_start_time: startTime,
  }, 'generate shotgun tee times');
}

async function createLeague(client, { courseId, name, gameFormat, seasonLengthWeeks }) {
  return executeRpc(client, 'create_league', {
    p_course_id: courseScope(courseId),
    p_name: name,
    p_game_format: gameFormat,
    p_season_length_weeks: seasonLengthWeeks,
  }, 'create league');
}

async function updateLeagueFormat(client, { courseId, leagueId, gameFormat }) {
  return executeRpc(client, 'update_league_format', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_game_format: gameFormat,
  }, 'update league format');
}

async function saveLeaguePlayoffBracket(client, { courseId, leagueId, bracket }) {
  return executeRpc(client, 'save_league_playoff_bracket', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_bracket: bracket,
  }, 'save league playoff bracket');
}

async function replaceLeagueFixtures(client, { courseId, leagueId, totalWeeks, doubleRound, fixtures }) {
  return executeRpc(client, 'replace_league_fixtures', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_total_weeks: totalWeeks,
    p_double_round: Boolean(doubleRound),
    p_fixtures: fixtures,
  }, 'replace league fixtures');
}

async function addLeagueSubstitute(client, { courseId, leagueId, name, handicap, phone, email }) {
  return executeRpc(client, 'add_league_substitute', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_name: name,
    p_handicap: handicap,
    p_phone: phone,
    p_email: email,
  }, 'add league substitute');
}

async function saveTeamRsvp(client, { courseId, leagueId, teamId, weekNumber, status, note }) {
  return executeRpc(client, 'save_team_rsvp', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_team_id: requireUuid(teamId, 'RSVP team scope'),
    p_week_number: weekNumber,
    p_status: status,
    p_note: note,
  }, 'save team RSVP');
}

async function postponeLeagueWeek(client, { courseId, leagueId, weekNumber }) {
  return executeRpc(client, 'postpone_league_week', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
    p_week_number: weekNumber,
  }, 'postpone league week');
}

async function saveTVDisplaySettings(client, {
  courseId, leagueId, templateType, autoScrollSpeed, showAnnouncements,
  announcementText, celebrationEffects, soundEnabled,
}) {
  return executeRpc(client, 'save_tv_display_settings', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'TV league scope'),
    p_template_type: templateType,
    p_auto_scroll_speed: autoScrollSpeed,
    p_show_announcements: Boolean(showAnnouncements),
    p_announcement_text: announcementText,
    p_celebration_effects: Boolean(celebrationEffects),
    p_sound_enabled: Boolean(soundEnabled),
  }, 'save TV display settings');
}

async function addTVSponsor(client, { courseId, leagueId, name, logoUrl, displayOrder }) {
  return executeRpc(client, 'add_tv_sponsor', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'TV sponsor league scope'),
    p_name: name,
    p_logo_url: logoUrl,
    p_display_order: displayOrder,
  }, 'add TV sponsor');
}

async function deleteTVSponsor(client, { courseId, leagueId, sponsorId }) {
  return executeRpc(client, 'delete_tv_sponsor', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'TV sponsor league scope'),
    p_sponsor_id: requireUuid(sponsorId, 'TV sponsor scope'),
  }, 'delete TV sponsor');
}

async function applyGhostScore(client, { courseId, leagueId, teamId, weekNumber }) {
  return executeRpc(client, 'apply_ghost_score', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'ghost-score league scope'),
    p_team_id: requireUuid(teamId, 'ghost-score team scope'),
    p_week_number: weekNumber,
  }, 'apply ghost score');
}

async function createCourseInvitation(client, { courseId, email, role, ttlDays = 7 }) {
  return executeRpc(client, 'create_course_invitation', {
    p_course_id: courseScope(courseId),
    p_email: email,
    p_role: role,
    p_ttl_days: ttlDays,
  }, 'create course invitation');
}

async function updateCourseMemberRole(client, { courseId, membershipId, role }) {
  return executeRpc(client, 'update_course_member_role', {
    p_course_id: courseScope(courseId),
    p_membership_id: requireUuid(membershipId, 'membership scope'),
    p_role: role,
  }, 'update course member role');
}

async function removeCourseMember(client, { courseId, membershipId }) {
  return executeRpc(client, 'remove_course_member', {
    p_course_id: courseScope(courseId),
    p_membership_id: requireUuid(membershipId, 'membership scope'),
  }, 'remove course member');
}

async function revokeCourseInvitation(client, { courseId, invitationId }) {
  return executeRpc(client, 'revoke_course_invitation', {
    p_course_id: courseScope(courseId),
    p_invitation_id: requireUuid(invitationId, 'invitation scope'),
  }, 'revoke course invitation');
}

async function consumeRateLimit(adminClient, { scope, subjectHash, maxRequests, windowSeconds }) {
  const data = await executeRpc(adminClient, 'consume_rate_limit', {
    p_scope: scope,
    p_subject_hash: subjectHash,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  }, 'consume rate limit');
  const result = Array.isArray(data) ? data[0] : data;
  return {
    allowed: Boolean(result?.allowed),
    remaining: Number(result?.remaining || 0),
    retryAfterSeconds: Number(result?.retry_after_seconds || 0),
  };
}

async function markCourseInvitationDelivery(adminClient, { invitationId, authUserId = null, error = null }) {
  return executeRpc(adminClient, 'mark_course_invitation_delivery', {
    p_invitation_id: requireUuid(invitationId, 'invitation scope'),
    p_auth_user_id: authUserId ? requireUuid(authUserId, 'auth user scope') : null,
    p_error: error,
  }, 'mark invitation delivery');
}

async function registerPlayerTeam(adminClient, { leagueId, teamName, handicap, pinHash }) {
  return executeRpc(adminClient, 'register_player_team', {
    p_league_id: requireUuid(leagueId, 'registration league scope'),
    p_team_name: teamName,
    p_handicap: handicap,
    p_pin_hash: pinHash,
  }, 'register player team');
}

async function upgradePlayerPinHash(adminClient, { teamId, pinHash }) {
  return executeRpc(adminClient, 'upgrade_player_pin_hash', {
    p_team_id: requireUuid(teamId, 'player team scope'),
    p_pin_hash: pinHash,
  }, 'upgrade player PIN hash');
}

async function submitPlayerGrossScore(adminClient, { teamId, grossScore }) {
  return executeRpc(adminClient, 'submit_player_gross_score', {
    p_team_id: requireUuid(teamId, 'player score team scope'),
    p_gross_score: grossScore,
  }, 'submit player gross score');
}

async function submitPlayerHoleScorecard(adminClient, { teamId, matchId, holes, photoUrl = null }) {
  return executeRpc(adminClient, 'submit_player_hole_scorecard', {
    p_team_id: requireUuid(teamId, 'player scorecard team scope'),
    p_match_id: requireUuid(matchId, 'player scorecard match scope'),
    p_holes: holes,
    p_photo_url: photoUrl,
  }, 'submit player hole scorecard');
}

async function attestPlayerScore(adminClient, { teamId, scoreId, attestingTeamId }) {
  return executeRpc(adminClient, 'attest_player_score', {
    p_team_id: requireUuid(teamId, 'player attestation team scope'),
    p_score_id: requireUuid(scoreId, 'player attestation score scope'),
    p_attesting_team_id: requireUuid(attestingTeamId, 'attesting team scope'),
  }, 'attest player score');
}

async function updatePlayerProfile(adminClient, {
  teamId, bio, favoriteClub, handicapGoal, themePreference = 'system', language = 'en-US',
}) {
  return executeRpc(adminClient, 'update_player_profile', {
    p_team_id: requireUuid(teamId, 'player profile team scope'),
    p_bio: bio,
    p_favorite_club: favoriteClub,
    p_handicap_goal: handicapGoal,
    p_theme_preference: themePreference,
    p_language: language,
  }, 'update player profile');
}

async function addPlayerBagClub(adminClient, { teamId, clubName, brand, avgDistanceYards }) {
  return executeRpc(adminClient, 'add_player_bag_club', {
    p_team_id: requireUuid(teamId, 'player bag team scope'),
    p_club_name: clubName,
    p_brand: brand,
    p_avg_distance_yards: avgDistanceYards,
  }, 'add player bag club');
}

async function deletePlayerBagClub(adminClient, { teamId, clubId }) {
  return executeRpc(adminClient, 'delete_player_bag_club', {
    p_team_id: requireUuid(teamId, 'player bag team scope'),
    p_club_id: requireUuid(clubId, 'player club scope'),
  }, 'delete player bag club');
}

async function savePlayerRoundNote(adminClient, { teamId, weekNumber, notes }) {
  return executeRpc(adminClient, 'save_player_round_note', {
    p_team_id: requireUuid(teamId, 'player note team scope'),
    p_week_number: weekNumber,
    p_notes: notes,
  }, 'save player round note');
}

async function previewRosterImport(client, { importId, courseId, leagueId, actorUserId, sourceName, totalRows, validRows, invalidRows, rows }) {
  const result = await client.rpc('preview_roster_import', {
    p_import_id: requireUuid(importId, 'roster import scope'),
    p_course_id: requireUuid(courseId, 'roster import course scope'),
    p_league_id: requireUuid(leagueId, 'roster import league scope'),
    p_actor_id: requireUuid(actorUserId, 'roster import actor scope'),
    p_source_name: sourceName,
    p_total_rows: totalRows,
    p_valid_rows: validRows,
    p_invalid_rows: invalidRows,
    p_rows: rows
  });
  return unwrapSupabaseResult(result, 'preview roster import');
}

async function commitRosterImport(client, { importId, courseId, actorUserId, credentials }) {
  const result = await client.rpc('commit_roster_import', {
    p_import_id: requireUuid(importId, 'roster commit scope'),
    p_course_id: requireUuid(courseId, 'roster commit course scope'),
    p_actor_id: requireUuid(actorUserId, 'roster commit actor scope'),
    p_credentials: credentials
  });
  return unwrapSupabaseResult(result, 'commit roster import');
}

async function archiveLeague(client, { courseId, leagueId }) {
  return executeRpc(client, 'archive_league', {
    p_course_id: courseScope(courseId),
    p_league_id: requireUuid(leagueId, 'league scope'),
  }, 'archive league');
}

module.exports = {
  archiveLeague,
  addTVSponsor,
  addPlayerBagClub,
  applyGhostScore,
  attestPlayerScore,
  consumeRateLimit,
  createLeague,
  createCourseInvitation,
  deleteCourseTeeBox,
  deleteTVSponsor,
  deletePlayerBagClub,
  generateShotgunTeeTimes,
  initializeCourseLayout,
  addLeagueSubstitute,
  lockRoundAndAdvance,
  markCourseInvitationDelivery,
  registerPlayerTeam,
  removeCourseMember,
  requestScoreCorrection,
  reviewScoreCorrection,
  revokeCourseInvitation,
  rotatePublicLink,
  postponeLeagueWeek,
  replaceLeagueFixtures,
  saveScoreBatch,
  savePlayerRoundNote,
  saveLeaguePlayoffBracket,
  saveTeamRsvp,
  saveTVDisplaySettings,
  submitPlayerGrossScore,
  submitPlayerHoleScorecard,
  saveCourseHoles,
  updateCourseProfile,
  updateLeagueFormat,
  updateCourseMemberRole,
  updatePlayerProfile,
  upsertCourseTeeBox,
  upgradePlayerPinHash,
  previewRosterImport,
  commitRosterImport,
};
