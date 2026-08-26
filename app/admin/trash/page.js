import db from '../../../lib/database';
import { restoreLeague } from './actions';
import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import { TrashIcon, RefreshIcon, FlagstickIcon } from '../../../components/icons/GolfIcons';
import EmptyState from '../../../components/ui/EmptyState';

export default async function TrashBinPage() {
  const context = await getAdminContext();
  if (!context) return <div style={{ padding: '2rem', color: 'var(--color-text-main)' }}>Please log in to continue.</div>;
  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) {
    return <EmptyState eyebrow="Restricted area" title="Course manager access required" description="Only course owners and managers can restore archived leagues." primaryHref="/admin" primaryLabel="Back to overview" />;
  }

  const courseId = context.courseId;
  const { createAdminClient } = require('../../../lib/supabase/admin');
  const adminClient = createAdminClient();
  const { getTrashedLeaguesAsync } = require('../../../lib/services/trashService');

  const trashedLeagues = await getTrashedLeaguesAsync(db, adminClient, courseId);

  return (
    <div className="container" style={{ padding: 0, maxWidth: '1000px' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <TrashIcon size={14} color="#059669" />
            <span style={{ color: '#047857', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Archive & Data Safety
            </span>
          </div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>
            Archived Leagues & Retention
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>
            Archived leagues are preserved here for 30 days. Reinstating a league restores its complete scorecard history and WHS calculations.
          </p>
        </div>
      </header>

      {trashedLeagues.length === 0 ? (
        <div className="birvo-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', color: 'var(--color-text-muted)', background: '#ffffff' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
            <TrashIcon size={28} color="#94a3b8" />
          </div>
          <h3 style={{ color: 'var(--color-text-main)', fontSize: '1.2rem', margin: '0 0 0.5rem 0', fontWeight: 800 }}>Trash Bin is Empty</h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>No archived leagues requiring recovery or permanent purge.</p>
        </div>
      ) : (
        <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto', background: '#ffffff' }}>
          <table style={{ width: '100%', minWidth: '600px', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '12px 8px' }}>League Name</th>
                <th style={{ padding: '12px 8px' }}>Archived Date</th>
                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {trashedLeagues.map(league => (
                <tr key={league.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '14px 8px', fontWeight: 700, color: 'var(--color-text-main)' }}>{league.name}</td>
                  <td style={{ padding: '14px 8px', color: '#dc2626', fontSize: '0.85rem' }}>
                    {league.trashed_at ? new Date(league.trashed_at).toLocaleDateString('en-US') : 'Today'} (Auto-purge in 30 days)
                  </td>
                  <td style={{ padding: '14px 8px', textAlign: 'right' }}>
                    <form action={restoreLeague}>
                      <input type="hidden" name="leagueId" value={league.id} />
                      <button type="submit" className="birvo-btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
                        Restore League
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
