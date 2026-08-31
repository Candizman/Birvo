import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import { setTreasurySettings, setTeamDues } from './actions';
import EmptyState from '../../../components/ui/EmptyState';
import { DollarSignIcon, UsersIcon } from '../../../components/icons/GolfIcons';
import { createClient } from '../../../lib/supabase/server';
import treasuryService from '../../../lib/services/treasuryService';

function centsToDollarInput(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

function formatCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

const inputStyle = {
  padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border)',
  background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.9rem',
};
const selectStyle = { ...inputStyle, cursor: 'pointer' };
const buttonStyle = {
  padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--color-border)',
  background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '0.8rem', fontWeight: 750, cursor: 'pointer',
};

export default async function TreasuryPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to manage league treasury." primaryHref="/login" primaryLabel="Sign in" />;
  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) {
    return <EmptyState eyebrow="Restricted area" title="Course manager access required" description="Only course owners and managers can change dues amounts or mark a team paid." primaryHref="/admin" primaryLabel="Back to overview" />;
  }
  if (!context.leagueId) {
    return <EmptyState title="No active league selected" description="Create or select an active league before tracking its treasury." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;
  }

  const view = await treasuryService.getTreasuryView(await createClient(), {
    courseId: context.courseId, leagueId: context.leagueId,
  });
  if (!view) return <EmptyState title="League not found" description="The active league could not be loaded." primaryHref="/admin/leagues" primaryLabel="Manage leagues" />;

  const { league, teams, duesSummary } = view;

  return (
    <div className="container" style={{ padding: 0, maxWidth: '100%' }}>

      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
          <DollarSignIcon size={14} color="#d4af37" />
          <span style={{ color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase' }}>
            Treasury
          </span>
        </div>
        <h1 className="title-gold" style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900 }}>{league.name}</h1>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', maxWidth: '640px' }}>
          Season dues and skins-pot cash, tracked by hand. Birvo does not collect payments —
          mark what a team actually paid you at the counter.
        </p>
      </header>

      {/* ─── SETTINGS ───────────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
        <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1.5rem' }}>Season pricing</h2>
        <form action={setTreasurySettings} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem', alignItems: 'end' }}>
          <input type="hidden" name="leagueId" value={league.id} />
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
              Season dues per team
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" name="duesAmount" min="0" step="0.01" defaultValue={centsToDollarInput(league.dues_amount_cents)} style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
              Skins entry fee per team, per week
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>$</span>
              <input type="number" name="skinsEntryFee" min="0" step="0.01" defaultValue={centsToDollarInput(league.skins_entry_fee_cents)} style={{ ...inputStyle, width: '100%' }} />
            </div>
          </div>
          <div>
            <button type="submit" style={{ ...buttonStyle, padding: '10px 20px', background: 'var(--color-primary)', color: '#080c14' }}>
              Save pricing
            </button>
          </div>
        </form>
        <p style={{ margin: '1rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          Set the skins fee to $0 to run skins for pride only — Birvo will still show who won how many skins,
          just not what they are worth.
        </p>
      </div>

      {/* ─── DUES LEDGER ────────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '2rem', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <h2 className="title-primary" style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UsersIcon size={18} color="#10b981" /> Season dues
          </h2>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#4ade80' }}>
              {formatCents(duesSummary.totalCollectedCents)} <span style={{ color: 'var(--color-text-muted)', fontSize: '1rem', fontWeight: 700 }}>/ {formatCents(duesSummary.totalDueCents)}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {duesSummary.paidCount} of {duesSummary.billableCount} teams paid
              {duesSummary.waivedCount > 0 ? ` · ${duesSummary.waivedCount} waived` : ''}
            </div>
          </div>
        </div>

        {teams.length === 0 ? (
          <EmptyState title="No active teams yet" description="Add teams to this league before tracking their dues." primaryHref="/admin/roster-import" primaryLabel="Import a roster" />
        ) : (
          <table style={{ width: '100%', minWidth: '760px', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px' }}>Team</th>
                <th style={{ padding: '12px' }}>Amount</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Paid via</th>
                <th style={{ padding: '12px' }}>Note</th>
                <th style={{ padding: '12px' }} />
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <tr key={team.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '14px 12px', fontWeight: 700, color: 'white' }}>{team.name}</td>
                  <td style={{ padding: '14px 12px', color: 'var(--color-text-muted)' }}>
                    {formatCents(league.dues_amount_cents)}
                    {team.dues_paid_at && (
                      <div style={{ fontSize: '0.72rem', marginTop: '2px' }}>
                        {new Date(team.dues_paid_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 12px' }} colSpan={4}>
                    <form action={setTeamDues} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <select name="status" defaultValue={team.dues_status} style={selectStyle}>
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="waived">Waived</option>
                      </select>
                      <select name="method" defaultValue={team.dues_paid_method || 'cash'} style={selectStyle} title="Only used when the status is Paid">
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="other">Other</option>
                      </select>
                      <input type="text" name="note" defaultValue={team.dues_note || ''} placeholder="Optional note" maxLength={200} style={{ ...inputStyle, minWidth: '160px', flex: '1 1 160px' }} />
                      <button type="submit" style={buttonStyle}>Save</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
