import Link from 'next/link';
import { redirect } from 'next/navigation';
import BrandMark from '../../components/BrandMark';
import { getAdminContext } from '../../lib/auth';
import OnboardingForm from './OnboardingForm';
import styles from './onboarding.module.css';

export const metadata = {
  title: 'Set Up Your Course',
  description: 'Create a secure Birvo workspace for your golf course and first league.',
};

export default async function OnboardingPage({ searchParams }) {
  const query = await searchParams;
  const context = await getAdminContext();
  if (!context?.user) redirect('/login');

  const previewOnly = process.env.NODE_ENV !== 'production' && query?.preview === '1';
  if (context.courseId && !previewOnly) redirect('/admin');

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" aria-label="Birvo home"><BrandMark /></Link>
        <div>
          <span>Secure tenant setup</span>
          <strong>Private workspace</strong>
        </div>
      </header>

      <div className={styles.intro}>
        <span className={styles.eyebrow}>COURSE ONBOARDING</span>
        <h1>Build your golf operations workspace.</h1>
        <p>Tell us about your course and first league. Birvo will create a tenant-isolated starting point without sample course data or fake billing records.</p>
      </div>

      <OnboardingForm accountEmail={context.user.email || 'Signed-in administrator'} previewOnly={previewOnly} />

      <footer className={styles.footer}>
        <span>© 2026 Birvo</span>
        <Link href="/login">Use a different account</Link>
      </footer>
    </main>
  );
}
