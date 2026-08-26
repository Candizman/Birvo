import Link from 'next/link';
import BrandMark from '../../components/BrandMark';
import { login } from './actions';
import styles from './login.module.css';

const errorMessages = {
  credentials: 'We could not verify that email and password. Check your credentials and try again.',
  config: 'Admin sign-in has not been configured yet. Contact your system administrator.',
  link: 'This sign-in or recovery link is invalid or has expired. Request a new link and try again.',
  unavailable: 'Secure sign-in is temporarily unavailable. No access changes were made; try again shortly.'
};

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const errorMessage = params?.error ? errorMessages[params.error] || errorMessages.credentials : null;

  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brandRow}>
          <Link href="/" aria-label="Birvo home">
            <BrandMark />
          </Link>
          <span className={styles.secureBadge}>Secure access</span>
        </div>

        <div className={styles.heading}>
          <span className={styles.eyebrow}>CLUB OPERATIONS</span>
          <h1 id="login-title">Sign in to the admin dashboard</h1>
          <p>Manage leagues, schedules, scores, and course operations from one place.</p>
        </div>

        {errorMessage && <div className={styles.error} role="alert">{errorMessage}</div>}

        <form action={login} className={styles.form}>
          <label>
            <span>Email address</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="manager@yourclub.com"
            />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Your password"
            />
          </label>

          <button type="submit" className="birvo-btn-primary">Sign in</button>
        </form>

        <Link className={styles.backLink} style={{ marginTop: '14px' }} href="/forgot-password">Forgot your password?</Link>

        <div className={styles.playerNote}>
          <strong>Looking for player access?</strong>
          <span>The player portal opens from the secure invitation link shared by your league administrator.</span>
        </div>

        <Link className={styles.backLink} href="/">← Back to Birvo</Link>
      </section>
    </main>
  );
}
