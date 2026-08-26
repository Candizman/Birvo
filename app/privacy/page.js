import Link from 'next/link';
import BrandMark from '../../components/BrandMark';

export const metadata = {
  title: 'Privacy Policy',
  description: 'Birvo privacy policy — how we handle your data.',
};

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '3rem 1rem 6rem' }}>
      <article style={{ maxWidth: '720px', margin: '0 auto' }}>
        <header style={{ marginBottom: '3rem' }}>
          <Link href="/" aria-label="Birvo home">
            <BrandMark />
          </Link>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em', marginTop: '2rem' }}>
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem', fontSize: '0.95rem' }}>
            Last updated: August 2026
          </p>
        </header>

        <div style={{ color: 'var(--color-text-main)', lineHeight: 1.8, fontSize: '1.02rem' }}>
          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>1. Information We Collect</h2>
            <p>
              Birvo collects information that you provide directly when you create an account, set up a course workspace, or manage league operations. This may include:
            </p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.75rem' }}>
              <li>Account email address and authentication credentials</li>
              <li>Course name, location, and contact information</li>
              <li>League, team, and player names</li>
              <li>Golf scores and handicap data</li>
              <li>Staff role assignments and invitation records</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.75rem' }}>
              <li>Provide and maintain the Birvo platform</li>
              <li>Calculate handicaps, standings, and scoring results</li>
              <li>Generate reports, cart signs, and clubhouse TV displays</li>
              <li>Send operational notifications (invitations, password recovery)</li>
              <li>Improve and develop new features</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>3. Data Sharing</h2>
            <p>
              Birvo does not sell your personal information. We share data only as necessary to operate the service:
            </p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.75rem' }}>
              <li><strong>Within your course workspace:</strong> League standings and scores are visible to course staff and participating players as configured by the course administrator.</li>
              <li><strong>Public links:</strong> Course administrators may choose to publish standings via signed public links. These links display only league scoring data.</li>
              <li><strong>Service providers:</strong> We use Supabase for authentication and data storage, and may use third-party services for email delivery and payment processing.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>4. Data Security</h2>
            <p>
              We implement security measures including encrypted connections (TLS), hashed credentials (scrypt for player PINs), signed session tokens, row-level tenant isolation, and role-based access controls. No system is completely secure, and we cannot guarantee the absolute security of your information.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>5. Data Retention and Deletion</h2>
            <p>
              Active course data is retained as long as your account is active. Archived leagues are preserved for historical reference. Deleted leagues enter a 30-day trash period before permanent removal. You may request complete account and data deletion by contacting us.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>6. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have the right to access, correct, delete, or export your personal data. Course administrators can manage team and player records through the admin dashboard. For account-level requests, please contact us directly.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>7. Handicap Calculations</h2>
            <p>
              Birvo provides handicap calculations for league management convenience. These calculations are <strong>not</strong> officially sanctioned by the USGA, WHS, GHIN, or any golf governing body. They should not be represented as federation-approved or legally authoritative handicap indices.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>8. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify course administrators of material changes through the platform.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>9. Contact</h2>
            <p>
              For privacy questions or data requests, please contact us at <strong>privacy@birvo.com</strong>.
            </p>
          </section>
        </div>

        <footer style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
          <p>© 2026 Birvo. All rights reserved.</p>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
            <Link href="/terms" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Terms of Service</Link>
            <Link href="/" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Home</Link>
          </div>
        </footer>
      </article>
    </main>
  );
}
