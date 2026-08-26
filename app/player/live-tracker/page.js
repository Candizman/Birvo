import db from '../../../lib/database';
import { getPlayerSession } from '../../../lib/auth';
import { redirect } from 'next/navigation';
import LiveTrackerView from './LiveTrackerView';
import Link from 'next/link';
import dataBackend from '../../../lib/data/backend';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { getPlayerLiveScorecard } = playerRepository;

export default async function PlayerLiveTrackerPage() {
  const session = await getPlayerSession();
  if (!session || !session.teamId) {
    redirect('/player/login');
  }

  const activeDataBackend = resolveDataBackend();
  let team;
  let match;
  let courseHoles = [];
  let existingScore = null;
  let existingHoleDetails = {};

  if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
    let scorecard = null;
    try {
      const adminClient = createAdminClient();
      scorecard = adminClient ? await getPlayerLiveScorecard(adminClient, session.teamId) : null;
    } catch {
      scorecard = null;
    }
    if (!scorecard) redirect('/player/login');
    ({ team, match, courseHoles, existingScore, existingHoleDetails } = scorecard);
  } else {
    team = db.prepare(`
      SELECT t.id,t.name,t.current_handicap,t.league_id,t.course_id,
        l.current_week,l.name AS league_name
      FROM teams t
      JOIN leagues l ON t.league_id = l.id AND t.course_id = l.course_id
      WHERE t.id = ? AND t.status = 'active' AND l.status = 'active'
    `).get(session.teamId);
    if (!team) redirect('/player/login');
    match = db.prepare(`
      SELECT m.*
      FROM matches m
      JOIN match_fixtures f ON f.league_id = m.league_id AND f.week_number = m.week_number
      WHERE m.league_id = ? AND m.week_number = ?
        AND (f.team1_id = ? OR f.team2_id = ?)
      ORDER BY f.id ASC LIMIT 1
    `).get(team.league_id, team.current_week, team.id, team.id);
    courseHoles = db.prepare(`
      SELECT * FROM course_holes WHERE course_id = ? ORDER BY hole_number ASC
    `).all(team.course_id);
    existingScore = match
      ? db.prepare('SELECT * FROM scores WHERE match_id = ? AND team_id = ?').get(match.id, team.id)
      : null;
    if (existingScore) {
      const details = db.prepare('SELECT * FROM score_hole_details WHERE score_id = ?').all(existingScore.id);
      existingHoleDetails = Object.fromEntries(details.map(item => [item.hole_number, item]));
    }
  }

  if (!match) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem', background: 'var(--color-bg)' }}>
        <section className="birvo-card" style={{ width: '100%', maxWidth: '520px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 850, textTransform: 'uppercase' }}>Scorecard pending</p>
          <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '1.8rem' }}>No matchup is assigned for this week</h1>
          <p style={{ margin: '14px 0 24px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>Your live scorecard will appear here after the league administrator publishes the matchup.</p>
          <Link className="birvo-btn-primary" href="/player">Back to player portal</Link>
        </section>
      </main>
    );
  }

  if (![9, 18].includes(courseHoles.length)) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem', background: 'var(--color-bg)' }}>
        <section className="birvo-card" style={{ width: '100%', maxWidth: '520px', padding: '2rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 8px', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 850, textTransform: 'uppercase' }}>Course setup required</p>
          <h1 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '1.8rem' }}>The scorecard is not ready</h1>
          <p style={{ margin: '14px 0 24px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>Ask the league administrator to publish a complete 9-hole or 18-hole course layout.</p>
          <Link className="birvo-btn-primary" href="/player">Back to player portal</Link>
        </section>
      </main>
    );
  }

  return (
    <LiveTrackerView
      team={team}
      match={match}
      courseHoles={courseHoles}
      existingScores={existingHoleDetails}
      existingScoreId={existingScore?.id || null}
    />
  );
}
