const { verifyTeamPin } = require('../security/pin');

function calculateAdvancedStats(holeDetails, holePars) {
  let totalGross = 0;
  let totalPutts = 0;
  let firPossible = 0;
  let firHit = 0;
  let girHit = 0;
  let sandSaves = 0;

  for (let i = 0; i < holeDetails.length; i++) {
    const h = holeDetails[i];
    const par = holePars[i] || 4;
    const gross = h.gross_score !== undefined ? h.gross_score : (h.grossScore !== undefined ? h.grossScore : 4);
    const putts = h.putts !== undefined ? h.putts : 2;
    const fairwayHit = h.fairway_hit !== undefined ? h.fairway_hit : (h.fairwayHit !== undefined ? h.fairwayHit : false);
    const sandSave = h.sand_saves !== undefined ? h.sand_saves : (h.sandSave !== undefined ? h.sandSave : false);

    totalGross += gross;
    totalPutts += putts;

    // FIR (Fairway in Regulation): only on Par 4 and Par 5
    if (par > 3) {
      firPossible++;
      if (fairwayHit) firHit++;
    }

    // GIR (Green in Regulation): reached green in (Par - 2) strokes or fewer
    const shotsToGreen = gross - putts;
    if (shotsToGreen <= par - 2) {
      girHit++;
    }

    if (sandSave) sandSaves++;
  }

  const holesCount = holeDetails.length || 18;
  const firPercent = firPossible > 0 ? Number(((firHit / firPossible) * 100).toFixed(1)) : 100.0;
  const girPercent = Number(((girHit / holesCount) * 100).toFixed(1));
  const avgPuttsPerHole = Number((totalPutts / holesCount).toFixed(2));

  return {
    totalGross,
    totalPutts,
    firPercent,
    girPercent,
    avgPuttsPerHole,
    sandSaves
  };
}

function submitHoleByHoleScore(db, { matchId, teamId, weekNumber, holeDetails, photoUrl, modifiedBy = 'player' }) {
  return db.transaction(() => {
    // 1. Get course holes par layout
    const match = db.prepare(`
      SELECT m.*, l.course_id, t.current_handicap
      FROM matches m
      JOIN leagues l ON m.league_id = l.id
      JOIN teams t ON t.id = ?
      WHERE m.id = ?
    `).get(teamId, matchId);

    if (!match) throw new Error('Match or team not found.');
    if (match.locked_at || match.status === 'locked') throw new Error('This round is locked. Submit a score correction request instead.');

    const courseHoles = db.prepare('SELECT par, stroke_index FROM course_holes WHERE course_id = ? ORDER BY hole_number ASC').all(match.course_id);
    const pars = courseHoles.map(ch => ch.par);

    // Calculate advanced metrics
    const stats = calculateAdvancedStats(holeDetails, pars);
    const handicapUsed = match.current_handicap || 0.0;
    const netScore = Number((stats.totalGross - handicapUsed).toFixed(1));

    // 2. Check if score already exists
    const existingScore = db.prepare('SELECT id, gross_score FROM scores WHERE match_id = ? AND team_id = ?').get(matchId, teamId);

    let scoreId;
    if (existingScore) {
      scoreId = existingScore.id;
      // Audit log if gross changed
      if (existingScore.gross_score !== stats.totalGross) {
        db.prepare(`
          INSERT INTO score_audit_logs (score_id, old_gross, new_gross, reason, modified_by)
          VALUES (?, ?, ?, 'Hole score update', ?)
        `).run(scoreId, existingScore.gross_score, stats.totalGross, modifiedBy);
      }

      db.prepare(`
        UPDATE scores SET
          gross_score = ?,
          net_score = ?,
          scorecard_photo_url = COALESCE(?, scorecard_photo_url),
          attestation_status = 'pending'
        WHERE id = ?
      `).run(stats.totalGross, netScore, photoUrl || null, scoreId);
    } else {
      const result = db.prepare(`
        INSERT INTO scores (match_id, team_id, gross_score, net_score, handicap_used, scorecard_photo_url, attestation_status)
        VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `).run(matchId, teamId, stats.totalGross, netScore, handicapUsed, photoUrl || null);
      scoreId = result.lastInsertRowid;
    }

    // 3. Upsert hole details
    const insertHole = db.prepare(`
      INSERT INTO score_hole_details (score_id, hole_number, gross_score, putts, fairway_hit, gir, sand_saves, penalty_strokes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(score_id, hole_number) DO UPDATE SET
        gross_score = excluded.gross_score,
        putts = excluded.putts,
        fairway_hit = excluded.fairway_hit,
        gir = excluded.gir,
        sand_saves = excluded.sand_saves,
        penalty_strokes = excluded.penalty_strokes
    `);

    for (let i = 0; i < holeDetails.length; i++) {
      const h = holeDetails[i];
      const holeNumber = h.hole_number || h.holeNumber || (i + 1);
      const grossScore = h.gross_score !== undefined ? h.gross_score : (h.grossScore !== undefined ? h.grossScore : 4);
      const putts = h.putts !== undefined ? h.putts : 2;
      const fairwayHit = h.fairway_hit !== undefined ? h.fairway_hit : (h.fairwayHit !== undefined ? h.fairwayHit : false);
      const sandSaves = h.sand_saves !== undefined ? h.sand_saves : (h.sandSave !== undefined ? h.sandSave : false);
      const penaltyStrokes = h.penalty_strokes || h.penaltyStrokes || 0;

      const holePar = pars[i] || 4;
      const shotsToGreen = grossScore - putts;
      const isGir = shotsToGreen <= holePar - 2 ? 1 : 0;

      insertHole.run(
        scoreId,
        holeNumber,
        grossScore,
        putts,
        fairwayHit ? 1 : 0,
        isGir,
        sandSaves ? 1 : 0,
        penaltyStrokes
      );
    }

    return {
      scoreId,
      totalGross: stats.totalGross,
      netScore,
      stats
    };
  })();
}

function attestScore(db, scoreId, attestingTeamId, pin) {
  const team = db.prepare('SELECT pin FROM teams WHERE id = ?').get(attestingTeamId);
  if (!team || !verifyTeamPin(pin, team.pin)) {
    return { error: 'Invalid opponent PIN.' };
  }

  db.prepare(`
    UPDATE scores SET
      attestation_status = 'attested',
      attested_by_team_id = ?
    WHERE id = ?
  `).run(attestingTeamId, scoreId);

  return { success: true };
}

function disputeScore(db, scoreId, reason) {
  db.prepare(`
    UPDATE scores SET
      attestation_status = 'disputed',
      reconciliation_status = 'needs_review'
    WHERE id = ?
  `).run(scoreId);

  db.prepare(`
    INSERT INTO score_audit_logs (score_id, reason, modified_by)
    VALUES (?, ?, 'opponent_dispute')
  `).run(scoreId, reason || 'Score disagreement dispute');

  return { success: true };
}

function getTeamHoleStats(db, teamId) {
  const scores = db.prepare('SELECT id FROM scores WHERE team_id = ?').all(teamId);
  if (scores.length === 0) {
    return { totalRounds: 0, avgFIR: 0, avgGIR: 0, avgPutts: 0 };
  }

  const scoreIds = scores.map(s => s.id);
  const placeholders = scoreIds.map(() => '?').join(',');

  const holeData = db.prepare(`
    SELECT
      COUNT(*) as totalHoles,
      AVG(gross_score) as avgGross,
      AVG(putts) as avgPutts,
      AVG(fairway_hit) * 100 as firPercent,
      AVG(gir) * 100 as girPercent,
      SUM(sand_saves) as totalSandSaves
    FROM score_hole_details
    WHERE score_id IN (${placeholders})
  `).get(...scoreIds);

  return {
    totalRounds: scores.length,
    avgFIR: Number((holeData.firPercent || 0).toFixed(1)),
    avgGIR: Number((holeData.girPercent || 0).toFixed(1)),
    avgPutts: Number((holeData.avgPutts || 0).toFixed(2)),
    totalSandSaves: holeData.totalSandSaves || 0
  };
}

async function submitLiveRoundAsync(client, session, matchId, weekNumber, holes, photoUrl) {
  const dataBackend = require('../data/backend');
  const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const operationsRepository = require('../data/supabase/operationsRepository');
    return await operationsRepository.submitPlayerHoleScorecard(client, {
      teamId: session.teamId,
      matchId,
      holes,
      photoUrl,
    });
  }

  const db = require('../database');
  const assignedMatch = db.prepare(`
    SELECT m.id
    FROM matches m
    JOIN teams t ON t.id = ? AND t.league_id = m.league_id
    JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
    WHERE m.id = ? AND m.week_number = ? AND (f.team1_id = t.id OR f.team2_id = t.id)
  `).get(session.teamId, matchId, weekNumber);
  
  if (!assignedMatch) throw new Error('This scorecard is not assigned to your team.');

  return submitHoleByHoleScore(db, {
    matchId,
    teamId: session.teamId,
    weekNumber,
    holeDetails: holes.map(item => ({
      hole_number: item.holeNumber,
      gross_score: item.grossScore,
      putts: item.putts,
      fairway_hit: item.fairwayHit,
      sand_saves: item.sandSave,
      penalty_strokes: item.penaltyStrokes,
    })),
    photoUrl,
    modifiedBy: `player-${session.teamId}`,
  });
}

async function attestOwnScoreActionAsync(client, session, scoreId, pin) {
  const dataBackend = require('../data/backend');
  const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
  const { isHashedTeamPin, hashTeamPin } = require('../security/pin');

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const playerRepository = require('../data/supabase/playerRepository');
    const operationsRepository = require('../data/supabase/operationsRepository');
    
    const context = await playerRepository.getPlayerScoreOpponent(client, { teamId: session.teamId, scoreId });
    if (!context || !verifyTeamPin(pin, context.opponent.pin)) {
      throw new Error('The opponent PIN could not be verified.');
    }
    
    if (!isHashedTeamPin(context.opponent.pin)) {
      await operationsRepository.upgradePlayerPinHash(client, {
        teamId: context.opponent.id,
        pinHash: hashTeamPin(pin),
      });
    }
    
    await operationsRepository.attestPlayerScore(client, {
      teamId: session.teamId,
      scoreId,
      attestingTeamId: context.opponent.id,
    });
    return { success: true };
  }

  const db = require('../database');
  const opponent = db.prepare(`
    SELECT opponent.id, opponent.pin
    FROM scores s
    JOIN matches m ON m.id = s.match_id
    JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
    JOIN teams opponent ON opponent.id = CASE WHEN f.team1_id = s.team_id THEN f.team2_id ELSE f.team1_id END
    WHERE s.id = ? AND s.team_id = ? AND (f.team1_id = s.team_id OR f.team2_id = s.team_id)
  `).get(scoreId, session.teamId);
  
  if (!opponent || !verifyTeamPin(pin, opponent.pin)) throw new Error('The opponent PIN could not be verified.');
  
  const result = attestScore(db, scoreId, opponent.id, pin);
  if (result.error) throw new Error(result.error);
  return { success: true };
}

async function disputeScoreActionAsync(client, session, scoreId, reason) {
  const dataBackend = require('../data/backend');
  const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    const playerRepository = require('../data/supabase/playerRepository');
    await playerRepository.disputeScore(client, { scoreId, reason });
    return { success: true };
  }

  const db = require('../database');
  const opponentScore = db.prepare(`
    SELECT s.id
    FROM scores s
    JOIN matches m ON m.id = s.match_id
    JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
    WHERE s.id = ? AND s.team_id != ?
      AND (f.team1_id = ? OR f.team2_id = ?)
      AND (f.team1_id = s.team_id OR f.team2_id = s.team_id)
  `).get(scoreId, session.teamId, session.teamId, session.teamId);
  
  if (!opponentScore) throw new Error('You cannot dispute this score.');
  
  disputeScore(db, scoreId, reason);
  return { success: true };
}

module.exports = {
  calculateAdvancedStats,
  submitHoleByHoleScore,
  attestScore,
  disputeScore,
  getTeamHoleStats,
  submitLiveRoundAsync,
  attestOwnScoreActionAsync,
  disputeScoreActionAsync
};
