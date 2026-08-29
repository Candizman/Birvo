import TVView from './[leagueId]/TVView';
import Link from 'next/link';

export default async function TVDefaultPage() {
  const { getTVPreviewAsync } = require('../../lib/services/tvService');
  const preview = await getTVPreviewAsync();

  if (!preview) {
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

  if (preview.empty) {
    return (
      <div style={{ minHeight: '100vh', background: '#060a12', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#10b981' }}>Birvo Clubhouse TV Display</h1>
        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>No active golf leagues found in the system.</p>
        <Link href="/admin" style={{ padding: '12px 24px', background: '#10b981', color: '#060a12', fontWeight: 800, borderRadius: '8px', textDecoration: 'none' }}>Back to admin dashboard →</Link>
      </div>
    );
  }

  const { tvData } = preview;

  if (!tvData) {
    return (
      <div style={{ minHeight: '100vh', background: '#060a12', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading Clubhouse TV...</p>
      </div>
    );
  }

  return <TVView tvData={{ ...tvData, isPreview: true }} />;
}
