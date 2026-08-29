import { getPlayerSession } from '../../../lib/auth';
import { redirect } from 'next/navigation';
import LiveTrackerView from './LiveTrackerView';
import Link from 'next/link';
import { createAdminClient } from '../../../lib/supabase/admin';

export default async function PlayerLiveTrackerPage() {
  const session = await getPlayerSession();
  if (!session || !session.teamId) {
    redirect('/player/login');
  }

  const adminClient = createAdminClient();
  const { getPlayerLiveScorecardAsync } = require('../../../lib/services/playerService');
  const scorecard = await getPlayerLiveScorecardAsync(adminClient, session.teamId);
  if (!scorecard) redirect('/player/login');
  
  const { team, match, courseHoles, existingScore, existingHoleDetails } = scorecard;

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
