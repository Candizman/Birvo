'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, retry }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-US">
      <body style={{ margin: 0, padding: '32px', color: '#102f28', background: '#f6f5f0', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{ maxWidth: 680, margin: '10vh auto', padding: 40, border: '1px solid #efcdcd', borderRadius: 20, background: '#fff' }}>
          <title>Unexpected error | Birvo</title>
          <p style={{ color: '#8b2f2f', fontWeight: 800 }}>BIRVO RECOVERY</p>
          <h1>Something unexpected interrupted the page.</h1>
          <p style={{ color: '#60736c', lineHeight: 1.65 }}>Your data was not changed. You can safely try loading the page again.</p>
          <button type="button" onClick={() => retry()} style={{ padding: '11px 20px', border: 0, borderRadius: 999, color: '#fff', background: '#1d7a5f', fontWeight: 800, cursor: 'pointer' }}>Try again</button>
          {error?.digest && <p style={{ color: '#899891', fontSize: 12 }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
