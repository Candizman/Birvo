import Link from 'next/link';
import BrandMark from '../../../components/BrandMark';
import loginStyles from '../../login/login.module.css';
import { joinLeague } from './actions';
import entityIds from '../../../lib/security/entityId';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { validatePublicLeagueAccess } = publicAccessRepository;
const { getActiveLeagueContext } = playerRepository;

const formatNames = {
  stroke_play: 'Stroke play',
  individual_stroke_play: 'Individual stroke play',
  team_stroke_play: 'Team stroke play',
  match_play: 'Match play',
  scramble: 'Scramble'
};

export default async function JoinLeaguePage({ params, searchParams }) {
  const { leagueId } = await params;
  const query = await searchParams;
  const normalizedLeagueId = normalizeEntityId(leagueId);
  let league = null;
  let course = null;
  try {
    if (normalizedLeagueId && UUID_PATTERN.test(normalizedLeagueId)) {
      const adminClient = createAdminClient();
      const allowed = adminClient && await validatePublicLeagueAccess(
        adminClient, query?.access, { leagueId: normalizedLeagueId, purpose: 'player' }
      );
      const context = allowed ? await getActiveLeagueContext(adminClient, normalizedLeagueId) : null;
      league = context?.league || null;
      course = context?.course || null;
    }
  } catch {
    league = null;
    course = null;
  }

  if (!league || !course) {
    return (
      <main className={loginStyles.shell}>
        <section className={loginStyles.card}>
          <BrandMark />
          <div className={loginStyles.heading}>
            <span className={loginStyles.eyebrow}>LEAGUE REGISTRATION</span>
            <h1>Link could not be verified</h1>
            <p>The league may be closed. Ask your league administrator for a current registration link.</p>
          </div>
          <Link className={loginStyles.backLink} href="/">← Back to Birvo</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={loginStyles.shell}>
      <section className={loginStyles.card} aria-labelledby="join-title">
        <div className={loginStyles.brandRow}>
          <BrandMark />
          <span className={loginStyles.secureBadge}>Secure registration</span>
        </div>

        <div className={loginStyles.heading}>
          <span className={loginStyles.eyebrow}>{course.name.toLocaleUpperCase('en-US')}</span>
          <h1 id="join-title">Join the league</h1>
          <p>
            Register your team or player for <strong>{league.name}</strong>.
            {' '}{formatNames[league.game_format] || league.game_format?.replaceAll('_', ' ')}
            {course.city ? ` · ${course.city}` : ''}
          </p>
        </div>

        {query?.error && (
          <div className={loginStyles.error} role="alert">We could not validate the registration details. Check the fields and try again.</div>
        )}

        <form action={joinLeague} className={loginStyles.form}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="access" value={query?.access || ''} />

          <label>
            <span>Team / player name</span>
            <input
              type="text"
              name="teamName"
              required
              minLength="2"
              maxLength="50"
              autoComplete="organization"
              placeholder="e.g. Fairway Eagles"
            />
          </label>

          <label>
            <span>Starting Handicap Index <small>(optional)</small></span>
            <input type="number" name="handicap" min="0" max="54" step="0.1" inputMode="decimal" placeholder="e.g. 8.4" />
          </label>

          <button type="submit" className="birvo-btn-primary">Complete registration →</button>
        </form>
      </section>
    </main>
  );
}
