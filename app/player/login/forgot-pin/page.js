import Link from 'next/link';
import BrandMark from '../../../../components/BrandMark';
import styles from '../../../login/login.module.css';
import { requestTeamPinReset } from './actions';
import entityIds from '../../../../lib/security/entityId';
import publicAccessRepository from '../../../../lib/data/supabase/publicAccessRepository';
import playerRepository from '../../../../lib/data/supabase/playerRepository';
import { createAdminClient } from '../../../../lib/supabase/admin';

const { UUID_PATTERN, normalizeEntityId } = entityIds;
const { validatePublicLeagueAccess } = publicAccessRepository;
const { getActiveLeagueContext, listActiveLeagueTeams } = playerRepository;

export default async function ForgotPinPage({ searchParams }) {
  const params = await searchParams;
  const leagueId = normalizeEntityId(params?.leagueId);

  let league = null;
  let teams = [];
  try {
    if (leagueId && UUID_PATTERN.test(String(leagueId))) {
      const adminClient = createAdminClient();
      const allowed = adminClient && await validatePublicLeagueAccess(
        adminClient, params?.access, { leagueId, purpose: 'player' }
      );
      const context = allowed ? await getActiveLeagueContext(adminClient, leagueId) : null;
      league = context?.league || null;
      teams = league ? await listActiveLeagueTeams(adminClient, leagueId) : [];
    }
  } catch {
    league = null;
    teams = [];
  }

  return (
    <main className={styles.shell}>
      <section className={`${styles.card} ${styles.playerCard}`} aria-labelledby="forgot-pin-title">
        <div className={styles.brandRow}>
          <Link href="/" aria-label="Birvo home"><BrandMark /></Link>
          <span className={styles.secureBadge}>Account Recovery</span>
        </div>

        <div className={styles.heading}>
          <span className={styles.eyebrow}>TEAM SECURITY</span>
          <h1 id="forgot-pin-title">Recover your PIN</h1>
          <p>{league?.name || 'A valid league invitation link is required.'}</p>
        </div>

        {params?.sent ? (
          <div className={styles.successMessage} role="status" style={{ padding: '1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#047857', marginBottom: '1.5rem' }}>
            <strong>Recovery link generated.</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem' }}>Since Birvo is currently in testing without live SMTP, please check the server console for the reset link.</p>
          </div>
        ) : params?.error && (
          <div className={styles.error} role="alert">We could not process your request. Check the team selection and email.</div>
        )}

        {league ? (
          <form action={requestTeamPinReset} className={styles.form}>
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
              <span>Contact email</span>
              <input
                className={styles.pinInput}
                type="email"
                name="email"
                required
                placeholder="Team contact email"
                style={{ fontSize: '1rem', letterSpacing: 'normal' }}
              />
            </label>
            <button type="submit" className="birvo-btn-primary">Request PIN reset</button>
          </form>
        ) : (
          <div className={styles.invalidLink} role="status">
            <strong>Link could not be verified</strong>
            <span>You must access this page via a valid player invitation link.</span>
          </div>
        )}

        <Link className={styles.backLink} href={`/player/login?leagueId=${leagueId}&access=${params?.access || ''}`}>← Back to sign-in</Link>
      </section>
    </main>
  );
}
