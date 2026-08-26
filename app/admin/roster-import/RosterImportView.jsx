'use client';

import { useActionState } from 'react';
import { commitRosterAction, previewRosterAction } from './actions';

const template = 'team_name,email,handicap\nFairway Partners,players@example.com,12.4\nBack Nine Club,,8.1\n';

export default function RosterImportView({ leagues, defaultLeagueId }) {
  const [previewState, previewAction, previewPending] = useActionState(previewRosterAction, {});
  const [commitState, commitAction, commitPending] = useActionState(commitRosterAction, {});
  const preview = previewState?.preview;
  return <div style={{ maxWidth: 1000, margin: '0 auto' }}>
    <header style={{ marginBottom: '1.6rem' }}><span style={{ color: '#176b45', fontSize: '.76rem', fontWeight: 850, letterSpacing: '.08em' }}>ROSTER OPERATIONS</span><h1 style={{ margin: '5px 0 6px', fontSize: '2.15rem' }}>CSV roster import</h1><p style={{ color: '#64748b', maxWidth: 700 }}>Preview every row before Birvo writes any teams. Duplicate names, invalid emails, and out-of-range handicaps are isolated instead of partially importing bad data.</p></header>
    <section className="birvo-card" style={{ padding: '1.5rem', background: '#fff', marginBottom: '1.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 15, flexWrap: 'wrap', alignItems: 'center' }}><h2 style={{ margin: 0, fontSize: '1.2rem' }}>1. Upload and validate</h2><a download="birvo-roster-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} style={{ color: '#176b45', fontWeight: 800, fontSize: '.84rem' }}>Download CSV template</a></div>
      <form action={previewAction} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12, marginTop: 18, alignItems: 'end' }}>
        <label><span style={{ display: 'block', fontSize: '.8rem', fontWeight: 750, marginBottom: 5 }}>League</span><select name="leagueId" defaultValue={defaultLeagueId} required style={{ width: '100%', minHeight: 43, border: '1px solid #cbd5e1', borderRadius: 8, padding: '0 10px', background: '#fff' }}>{leagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}</select></label>
        <label><span style={{ display: 'block', fontSize: '.8rem', fontWeight: 750, marginBottom: 5 }}>CSV file (maximum 1 MB / 500 rows)</span><input name="rosterFile" type="file" accept=".csv,text/csv" required style={{ width: '100%', minHeight: 43, padding: 8, border: '1px solid #cbd5e1', borderRadius: 8 }} /></label>
        <button className="birvo-btn-primary" disabled={previewPending}>{previewPending ? 'Validating…' : 'Preview import'}</button>
      </form>
      {previewState?.error && <p role="alert" style={{ color: '#991b1b', fontWeight: 750 }}>{previewState.error}</p>}
    </section>

    {preview && <section className="birvo-card" style={{ padding: '1.5rem', background: '#fff' }}>
      <h2 style={{ margin: '0 0 7px', fontSize: '1.2rem' }}>2. Review before commit</h2>
      <p style={{ margin: '0 0 16px', color: '#64748b' }}>{preview.validRows} valid · {preview.invalidRows} blocked · {preview.totalRows} total</p>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 670, borderCollapse: 'collapse', textAlign: 'left' }}><thead><tr style={{ borderBottom: '1px solid #e2e8f0', fontSize: '.75rem', textTransform: 'uppercase', color: '#64748b' }}><th style={{ padding: 9 }}>Row</th><th>Team</th><th>Email</th><th>Handicap</th><th>Validation</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.rowNumber} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: 10 }}>{row.rowNumber}</td><td style={{ fontWeight: 750 }}>{row.name || '—'}</td><td>{row.email || '—'}</td><td>{row.handicap ?? '—'}</td><td><span style={{ color: row.status === 'valid' ? '#176b45' : '#991b1b', fontWeight: 750, textTransform: 'capitalize' }}>{row.status}</span>{row.message && <div style={{ color: '#64748b', fontSize: '.73rem', marginTop: 3 }}>{row.message}</div>}</td></tr>)}</tbody></table></div>
      <form action={commitAction} style={{ marginTop: 18, textAlign: 'right' }}><input type="hidden" name="importId" value={preview.importId} /><button className="birvo-btn-primary" disabled={commitPending || preview.validRows === 0}>{commitPending ? 'Importing…' : `Import ${preview.validRows} valid team(s)`}</button></form>
      {commitState?.error && <p role="alert" style={{ color: '#991b1b', fontWeight: 750 }}>{commitState.error}</p>}
      {commitState?.credentials && <div role="status" style={{ marginTop: 20, padding: 16, border: '1px solid #b8dac9', background: '#f0faf5', borderRadius: 10 }}><strong>{commitState.success} Save these one-time player PINs now.</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8, marginTop: 10 }}>{commitState.credentials.map(item => <div key={item.teamName} style={{ background: '#fff', borderRadius: 8, padding: 9 }}><span>{item.teamName}</span> <strong style={{ float: 'right', letterSpacing: '.12em' }}>{item.pin}</strong></div>)}</div></div>}
    </section>}
  </div>;
}
