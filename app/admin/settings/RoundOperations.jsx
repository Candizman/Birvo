'use client';

import { useActionState } from 'react';
import { advanceWeek, cancelWeek } from './actions';

function Message({ state }) {
  if (!state?.error && !state?.success) return null;
  return <p role={state.error ? 'alert' : 'status'} style={{ color: state.error ? '#991b1b' : '#176b45', fontSize: '.84rem', fontWeight: 750 }}>{state.error || state.success}</p>;
}

export function FinalizeRoundForm({ leagueId, currentWeek, readiness }) {
  const [state, action, pending] = useActionState(advanceWeek, {});
  return <div>
    <div style={{ padding: '10px 12px', borderRadius: 9, background: readiness.canLock ? '#f0faf5' : '#fff8eb', color: readiness.canLock ? '#176b45' : '#7a5425', fontSize: '.8rem', marginBottom: 14 }}>
      {readiness.canLock ? 'All closeout checks passed.' : readiness.blockers.join(' ')}
    </div>
    <form action={action}><input type="hidden" name="leagueId" value={leagueId} /><button type="submit" disabled={pending || !readiness.canLock} className="birvo-btn-primary" style={{ width: '100%', padding: '12px 24px', fontSize: '.95rem', opacity: readiness.canLock ? 1 : .55 }}>{pending ? 'Finalizing…' : `Lock Week ${currentWeek} and advance →`}</button></form>
    <Message state={state} />
  </div>;
}

export function RainoutForm({ leagueId }) {
  const [state, action, pending] = useActionState(cancelWeek, {});
  return <div><form action={action}><input type="hidden" name="leagueId" value={leagueId} /><button type="submit" disabled={pending} style={{ width: '100%', padding: '12px 24px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 800, cursor: 'pointer', fontSize: '.95rem' }}>{pending ? 'Postponing…' : 'Postpone Round (Rainout Shift)'}</button></form><Message state={state} /></div>;
}
