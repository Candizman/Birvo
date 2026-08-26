import { redirect } from 'next/navigation';
import { getAdminContext, hasAdminRole } from '../../lib/auth';

export const dynamic = 'force-dynamic';

export default async function SuperAdminLayout({ children }) {
  const context = await getAdminContext();
  if (!context || !hasAdminRole(context.role, ['superadmin'])) redirect('/admin');
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      {/* Dedicated super-admin navigation with a dark executive theme. */}
      <aside style={{ width: '280px', borderRight: '1px solid var(--color-border)', padding: '2rem 1rem', background: 'rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem', paddingLeft: '1rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.png" alt="Birvo HQ" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'contain' }} />
          <h2 className="title-gold" style={{ margin: 0, fontSize: '1.5rem', letterSpacing: '1px' }}>Birvo HQ</h2>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {['Course Facilities', 'Billing & Stripe', 'Platform Users', 'System Settings'].map(item => (
            <div key={item} style={{ padding: '12px 16px', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-text-main)', fontWeight: 500 }}>
              {item}
            </div>
          ))}
        </nav>
      </aside>
      <main style={{ flex: 1, padding: '3rem' }}>
        {children}
      </main>
    </div>
  );
}
