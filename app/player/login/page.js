import Link from 'next/link';
import BrandMark from '../../../components/BrandMark';
import db from '../../../lib/database';
import { hasPublicLeagueAccess } from '../../../lib/publicAccess';
import styles from '../../login/login.module.css';
import { playerLogin } from './actions';
import dataBackend from '../../../lib/data/backend';
import entityIds from '../../../lib/security/entityId';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import playerRepository from '../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../lib/supabase/admin';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { validatePublicLeagueAccess } = publicAccessRepository;
const { getActiveLeagueContext, listActiveLeagueTeams } = playerRepository;

export default async function PlayerLoginPage({ searchParams }) {
  const params = await searchParams;
  const activeDataBackend = resolveDataBackend();
  let leagueId = normalizeEntityId(params?.leagueId);

  if (activeDataBackend === DATA_BACKENDS.SQLITE && (!leagueId || !Number.isSafeInteger(Number(leagueId))) && process.env.NODE_ENV !== 'production') {
    leagueId = db.prepare("SELECT id FROM leagues WHERE status = 'active' ORDER BY id ASC LIMIT 1").get()?.id;
  }

  let league = null;
  let teams = [];
  try {
    if (activeDataBackend === DATA_BACKENDS.SUPABASE) {
      if (leagueId && UUID_PATTERN.test(String(leagueId))) {
        const adminClient = createAdminClient();
        const allowed = adminClient && await validatePublicLeagueAccess(
          adminClient, params?.access, { leagueId, purpose: 'player' }
        );
        const context = allowed ? await getActiveLeagueContext(adminClient, leagueId) : null;
        league = context?.league || null;
        teams = league ? await listActiveLeagueTeams(adminClient, leagueId) : [];
      }
    } else {
      leagueId = Number(leagueId);
      const allowed = Number.isSafeInteger(leagueId) && leagueId > 0
        && hasPublicLeagueAccess(params?.access, { leagueId, purpose: 'player', db });
      league = allowed
        ? db.prepare("SELECT name FROM leagues WHERE id = ? AND status = 'active'").get(leagueId)
        : null;
      teams = league
        ? db.prepare("SELECT id, name FROM teams WHERE league_id = ? AND status = 'active' ORDER BY name").all(leagueId)
        : [];
    }
  } catch {
    league = null;
    teams = [];
  }

  return (
    <main className={styles.shell}>
      <section className={`${styles.card} ${styles.playerCard}`} aria-labelledby="player-login-title">
        <div className={styles.brandRow}>
          <Link href="/" aria-label="Birvo home"><BrandMark /></Link>
          <span className={styles.secureBadge}>Player access</span>
        </div>

        <div className={styles.heading}>
          <span className={styles.eyebrow}>LEAGUE ACCESS</span>
          <h1 id="player-login-title">Player PIN sign-in</h1>
          <p>{league?.name || 'A valid league invitation link is required to open this page.'}</p>
        </div>

        {params?.error && league && (
          <div className={styles.error} role="alert">We could not verify the team or four-digit PIN.</div>
        )}

        {league ? (
          <form action={playerLogin} className={styles.form}>
            <input type="hidden" name="leagueId" value={leagueId} />
            <input type="hidden" name="access" value={params?.access || ''} />
            <label>
              <span>Team / player</span>
              <select name="teamId" required defaultValue="">
                <option value="" disabled>Select from the roster</option>
                {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <label>
              <span>Security PIN (4 digits)</span>
              <input
                className={styles.pinInput}
                type="password"
                name="pin"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength="4"
                pattern="[0-9]{4}"
                placeholder="••••"
              />
            </label>
            <button type="submit" className="birvo-btn-primary">Open player portal</button>
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link href={`/player/login/forgot-pin?leagueId=${leagueId}&access=${params?.access || ''}`} style={{ color: 'var(--color-primary)', fontSize: '0.9rem', fontWeight: 600 }}>
                Forgot your PIN?
              </Link>
            </div>
          </form>
        ) : (
          <div className={styles.invalidLink} role="status">
            <strong>Link could not be verified</strong>
            <span>Ask your league administrator for a new player invitation link.</span>
          </div>
        )}

        <Link className={styles.backLink} href="/">← Back to Birvo</Link>
      </section>
    </main>
  );
}
