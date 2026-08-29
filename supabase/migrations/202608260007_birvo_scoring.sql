CREATE OR REPLACE FUNCTION get_locked_scores_for_corrections(p_course_id uuid, p_league_id uuid)
RETURNS TABLE (
  id uuid,
  gross_score integer,
  week_number integer,
  team_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.gross_score, m.week_number, t.name AS team_name
  FROM scores s
  JOIN matches m ON m.id = s.match_id
  JOIN leagues l ON l.id = m.league_id
  JOIN teams t ON t.id = s.team_id
  WHERE l.course_id = p_course_id AND l.id = p_league_id AND m.locked_at IS NOT NULL
  ORDER BY m.week_number DESC, t.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_score_correction_requests_for_admin(p_course_id uuid, p_league_id uuid)
RETURNS TABLE (
  id uuid,
  score_id uuid,
  requested_gross_score integer,
  reason text,
  status text,
  created_at timestamptz,
  old_gross integer,
  week_number integer,
  team_name text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id, r.score_id, r.requested_gross_score, r.reason, r.status, r.created_at,
    s.gross_score AS old_gross, m.week_number, t.name AS team_name
  FROM score_correction_requests r
  JOIN scores s ON s.id = r.score_id
  JOIN matches m ON m.id = s.match_id
  JOIN leagues l ON l.id = m.league_id
  JOIN teams t ON t.id = s.team_id
  WHERE r.course_id = p_course_id AND l.id = p_league_id
  ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
