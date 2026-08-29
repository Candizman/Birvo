import Link from 'next/link';

/**
 * /tv without a league is not a display. A clubhouse screen is opened through a
 * signed per-league link from the admin dashboard, so this route only explains
 * where to get one.
 */
export default function TVDefaultPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#07140f', color: 'white', display: 'grid', placeItems: 'center', padding: '2rem', textAlign: 'center' }}>
      <div>
        <h1 style={{ margin: '0 0 10px', color: '#62c88a' }}>A Birvo TV link is required</h1>
        <p style={{ margin: '0 0 24px', color: '#a8b9b2' }}>Open the TV display from the signed league link in the admin dashboard.</p>
        <Link href="/" style={{ padding: '11px 18px', borderRadius: '9px', color: '#07140f', background: '#62c88a', fontWeight: 800, textDecoration: 'none' }}>Birvo home</Link>
      </div>
    </div>
  );
}
