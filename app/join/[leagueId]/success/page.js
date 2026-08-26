import Link from 'next/link';
import { cookies } from 'next/headers';
import BrandMark from '../../../../components/BrandMark';
import { verifyJoinReceiptToken } from '../../../../lib/playerSession';
import loginStyles from '../../../login/login.module.css';

export default async function JoinSuccessPage({ params }) {
  const { leagueId } = await params;
  const cookieStore = await cookies();
  const receipt = verifyJoinReceiptToken(cookieStore.get('join_receipt')?.value);
  const pin = receipt && String(receipt.leagueId) === String(leagueId) ? receipt.pin : null;
  const loginUrl = pin && receipt?.access
    ? `/player/login?leagueId=${leagueId}&access=${encodeURIComponent(receipt.access)}`
    : null;

  return (
    <main className={loginStyles.shell}>
      <section className={loginStyles.card} aria-labelledby="success-title">
        <div className={loginStyles.brandRow}>
          <BrandMark />
          <span className={loginStyles.secureBadge}>Registration complete</span>
        </div>

        <div className={loginStyles.heading}>
          <span className={loginStyles.eyebrow}>WELCOME</span>
          <h1 id="success-title">Your league registration is complete</h1>
          <p>
            {pin
              ? 'This PIN is shown for a limited time. Save it somewhere secure before opening the player portal.'
              : 'The PIN display window has expired, or this registration was created in another browser.'}
          </p>
        </div>

        <div className={loginStyles.pinPanel} aria-label={pin ? `Security PIN ${pin}` : 'PIN unavailable'}>
          <span>YOUR SECURITY PIN</span>
          <strong>{pin || '••••'}</strong>
        </div>

        {loginUrl ? (
          <Link href={loginUrl} className={`birvo-btn-primary ${loginStyles.actionLink}`}>
            Open player portal →
          </Link>
        ) : (
          <div className={loginStyles.invalidLink}>
            <strong>A new link is required</strong>
            <span>Ask your league administrator for a new invitation link.</span>
          </div>
        )}
      </section>
    </main>
  );
}
