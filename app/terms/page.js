import Link from 'next/link';
import BrandMark from '../../components/BrandMark';

export const metadata = {
  title: 'Terms of Service',
  description: 'Birvo terms of service — the rules governing your use of the platform.',
};

export default function TermsPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '3rem 1rem 6rem' }}>
      <article style={{ maxWidth: '720px', margin: '0 auto' }}>
        <header style={{ marginBottom: '3rem' }}>
          <Link href="/" aria-label="Birvo home">
            <BrandMark />
          </Link>
          <h1 style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em', marginTop: '2rem' }}>
            Terms of Service
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem', fontSize: '0.95rem' }}>
            Last updated: August 2026
          </p>
        </header>

        <div style={{ color: 'var(--color-text-main)', lineHeight: 1.8, fontSize: '1.02rem' }}>
          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Birvo platform (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you are using the Service on behalf of a golf course or organization, you represent that you have the authority to bind that organization to these terms.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>2. Description of Service</h2>
            <p>
              Birvo is a web-based platform that helps golf courses manage league operations, including team management, scoring, handicap calculations, standings, scheduling, and clubhouse publishing. The Service is provided as a B2B SaaS tool for golf course operators.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>3. Account Responsibilities</h2>
            <ul style={{ paddingLeft: '1.5rem' }}>
              <li>You are responsible for maintaining the security of your account credentials.</li>
              <li>Course administrators are responsible for managing staff access, player data, and league operations within their workspace.</li>
              <li>You must not share administrative credentials with unauthorized personnel.</li>
              <li>You are responsible for the accuracy of the data you enter into the system.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>4. Permitted Use</h2>
            <p>You may use the Service to:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.75rem' }}>
              <li>Manage golf league operations for courses you are authorized to operate</li>
              <li>Enter, track, and publish scoring data for your leagues</li>
              <li>Generate reports, displays, and printed materials for your course</li>
              <li>Invite staff members and register players in your leagues</li>
            </ul>
            <p style={{ marginTop: '0.75rem' }}>You may <strong>not</strong>:</p>
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.75rem' }}>
              <li>Attempt to access data from other course workspaces</li>
              <li>Use the Service for any unlawful purpose</li>
              <li>Reverse engineer, decompile, or attempt to extract source code</li>
              <li>Resell or sublicense the Service without written permission</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>5. Handicap and Scoring Disclaimer</h2>
            <p>
              Birvo provides handicap calculations and scoring tools for league management convenience. <strong>These calculations are not officially sanctioned by the USGA, World Handicap System (WHS), GHIN, or any golf governing body.</strong> Birvo handicap values should not be used as official handicap indices for tournament play outside of your local league.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>6. Data Ownership</h2>
            <p>
              You retain ownership of all data you enter into the Service, including course information, league configurations, team rosters, and scoring records. Birvo has a license to use this data solely to provide and improve the Service. Upon account termination, you may request a data export.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>7. Service Availability</h2>
            <p>
              We strive to maintain high availability, but do not guarantee uninterrupted access. The Service may be temporarily unavailable for maintenance, updates, or circumstances beyond our control. We will make reasonable efforts to notify course administrators of planned maintenance.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>8. Payment Terms</h2>
            <p>
              Subscription fees are billed according to the plan selected by the course administrator. Payment terms, cancellation policies, and refund procedures will be communicated at the time of purchase. Birvo reserves the right to modify pricing with reasonable notice.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>9. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Birvo shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, revenue, or business opportunities, arising from your use of the Service. Our total liability shall not exceed the amount you paid for the Service in the twelve months preceding the claim.
            </p>
          </section>

          <section style={{ marginBottom: '2.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>10. Termination</h2>
            <p>
              Either party may terminate the agreement at any time. Upon termination, your access to the Service will end. Course data will be retained for 30 days to allow data export before permanent deletion.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.75rem' }}>11. Contact</h2>
            <p>
              For questions about these terms, please contact us at <strong>legal@birvo.com</strong>.
            </p>
          </section>
        </div>

        <footer style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.88rem' }}>
          <p>© 2026 Birvo. All rights reserved.</p>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
            <Link href="/privacy" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Privacy Policy</Link>
            <Link href="/" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Home</Link>
          </div>
        </footer>
      </article>
    </main>
  );
}
