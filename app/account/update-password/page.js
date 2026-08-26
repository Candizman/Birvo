import Link from 'next/link';
import { redirect } from 'next/navigation';
import BrandMark from '../../../components/BrandMark';
import { createClient } from '../../../lib/supabase/server';
import PasswordForm from './PasswordForm';
import styles from '../../login/login.module.css';

export const dynamic = 'force-dynamic';

export default async function UpdatePasswordPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) redirect('/login?error=config');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?error=link');
  return (
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="password-title">
        <div className={styles.brandRow}><Link href="/" aria-label="Birvo home"><BrandMark /></Link><span className={styles.secureBadge}>Protected session</span></div>
        <div className={styles.heading}><span className={styles.eyebrow}>ACCOUNT SECURITY</span><h1 id="password-title">Choose a secure password</h1><p>Use at least 12 characters and a password you do not reuse on another service.</p></div>
        <PasswordForm />
      </section>
    </main>
  );
}
