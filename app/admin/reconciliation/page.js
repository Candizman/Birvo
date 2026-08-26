import db from '../../../lib/database';
import { getAdminContext } from '../../../lib/auth';
import { resolveScore, deleteScore } from './actions';
import {
  ShieldCheckIcon,
  AlertCircleIcon,
  CheckIcon,
  TrashIcon,
  FlagstickIcon,
  CalendarIcon
} from '../../../components/icons/GolfIcons';

export default async function ReconciliationPage() {
  const context = await getAdminContext();
  if (!context) {
    return <div style={{ padding: '2rem', color: 'white' }}>Please log in to continue.</div>;
  }
  const leagueId = context.leagueId;
  const { createAdminClient } = require('../../../lib/supabase/admin');
  const adminClient = createAdminClient();
  const { getScoresPendingReconciliationAsync } = require('../../../lib/services/reconciliationService');

  const reviewScores = await getScoresPendingReconciliationAsync(db, adminClient, leagueId);

  return (
    <div className="container" style={{ padding: 0, maxWidth: '100%' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <ShieldCheckIcon size={14} color="#d4af37" />
            <span style={{ color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Committee Audit Studio
            </span>
          </div>
          <h1 className="title-gold" style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900 }}>Score Reconciliation</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Inspect, diff, and resolve contested scorecards or unverified handicap differentials requiring committee sign-off.
          </p>
        </div>
      </header>

      {reviewScores.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
            <CheckIcon size={30} color="#10b981" />
          </div>
          <h2 style={{ color: 'white', fontSize: '1.4rem', margin: '0 0 0.5rem 0' }}>All Scorecards Reconciled & Attested</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', margin: 0 }}>
            There are zero disputed scores pending administrative review. The live championship standings are 100% official.
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '1.5rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px' }}>Round</th>
                <th style={{ padding: '12px' }}>Team / Player</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Gross Score</th>
                <th style={{ padding: '12px' }}>Audit Flag Issue</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Committee Resolution</th>
              </tr>
            </thead>
            <tbody>
              {reviewScores.map((score, idx) => (
                <tr key={score.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <td style={{ padding: '14px 12px', fontWeight: 800, color: 'var(--color-primary)' }}>
                    Week {score.week_number}
                  </td>
                  <td style={{ padding: '14px 12px', fontWeight: 700, color: 'white' }}>
                    {score.team_name}
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 800, color: '#cbd5e1', fontSize: '1.1rem' }}>
                    {score.gross_score}
                  </td>
                  <td style={{ padding: '14px 12px', color: '#fca5a5', fontSize: '0.9rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircleIcon size={16} color="#f87171" /> Handicap calculation missing on card
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <form action={resolveScore}>
                        <input type="hidden" name="scoreId" value={score.id} />
                        <input type="hidden" name="handicap" value={score.current_handicap} />
                        <input type="hidden" name="gross" value={score.gross_score} />
                        <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'var(--color-primary)', color: '#080c14', fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' }}>
                          Resolve (HI: {score.current_handicap})
                        </button>
                      </form>
                      <form action={deleteScore}>
                        <input type="hidden" name="scoreId" value={score.id} />
                        <button type="submit" style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                          Delete
                        </button>
                      </form>
                    </div>
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
