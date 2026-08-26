import Link from 'next/link';
import BrandMark from '../../components/BrandMark';
import { requestPasswordReset } from './actions';
import styles from '../login/login.module.css';

export default async function ForgotPasswordPage({ searchParams }) {
  const params = await searchParams;
  const error = params?.error === 'config'
    ? 'Password recovery has not been configured yet. Contact your system administrator.'
    : params?.error ? 'Enter a valid email address.' : null;
  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="recovery-title">
        <div className={styles.brandRow}><Link href="/" aria-label="Birvo home"><BrandMark /></Link><span className={styles.secureBadge}>Account recovery</span></div>
        <div className={styles.heading}><span className={styles.eyebrow}>SECURE ACCESS</span><h1 id="recovery-title">Reset your password</h1><p>Enter your work email. If a Birvo account exists, we will send a time-limited recovery link.</p></div>
        {error && <div className={styles.error} role="alert">{error}</div>}
        {params?.sent ? (
          <div className={styles.invalidLink} role="status"><strong>Check your inbox</strong><span>If an account exists for that email, a recovery link is on its way. The same response is shown for every address to protect account privacy.</span></div>
        ) : (
          <form action={requestPasswordReset} className={styles.form}>
            <label><span>Email address</span><input name="email" type="email" required autoComplete="email" placeholder="manager@yourclub.com" /></label>
            <button type="submit" className="birvo-btn-primary">Send recovery link</button>
          </form>
        )}
        <Link className={styles.backLink} href="/login">← Back to sign in</Link>
      </section>
    </main>
  );
}
