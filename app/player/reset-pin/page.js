import Link from 'next/link';
import BrandMark from '../../../components/BrandMark';
import styles from '../../login/login.module.css';
import { executeTeamPinReset } from './actions';
import entityIds from '../../../lib/security/entityId';

const { normalizeEntityId } = entityIds;

export default async function ResetPinPage({ searchParams }) {
  const params = await searchParams;
  const teamId = normalizeEntityId(params?.teamId);
  const token = params?.token;

  if (!teamId || !token) {
    return (
      <main className={styles.shell}>
        <section className={`${styles.card} ${styles.playerCard}`}>
          <div className={styles.heading}>
            <h1>Invalid link</h1>
            <p>Your PIN reset link is malformed or missing.</p>
          </div>
          <Link className={styles.backLink} href="/">← Back to Birvo</Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={`${styles.card} ${styles.playerCard}`} aria-labelledby="reset-pin-title">
        <div className={styles.brandRow}>
          <Link href="/" aria-label="Birvo home"><BrandMark /></Link>
          <span className={styles.secureBadge}>Secure reset</span>
        </div>

        <div className={styles.heading}>
          <h1 id="reset-pin-title">Create new PIN</h1>
          <p>Choose a new four-digit security PIN for your team.</p>
        </div>

        {params?.error && (
          <div className={styles.error} role="alert">
            {params.error === 'invalid' ? 'The new PIN is invalid.' : 'The reset link has expired or is invalid.'}
          </div>
        )}

        <form action={executeTeamPinReset} className={styles.form}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="token" value={token} />
          
          <label>
            <span>New Security PIN (4 digits)</span>
            <input
              className={styles.pinInput}
              type="password"
              name="newPin"
              required
              inputMode="numeric"
              autoComplete="new-password"
              maxLength="4"
              pattern="[0-9]{4}"
              placeholder="••••"
            />
          </label>
          <button type="submit" className="birvo-btn-primary">Update PIN</button>
        </form>
      </section>
    </main>
  );
}
