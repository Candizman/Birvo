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

module.exports = {
  calculateAdvancedStats,
  submitHoleByHoleScore,
  attestScore,
  disputeScore,
  getTeamHoleStats
};
