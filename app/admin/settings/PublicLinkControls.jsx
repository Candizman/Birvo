'use client';

import { useActionState } from 'react';
import { rotatePublicLinkAction } from './actions';

function LinkControl({ leagueId, purpose, label, description, url }) {
  const [state, action, pending] = useActionState(rotatePublicLinkAction, {});
  return <div style={{ minWidth: 0, padding: '13px 14px', border: '1px solid #e2e8f0', borderRadius: 11, background: '#f8fafc' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}><div style={{ minWidth: 0 }}><strong>{label}</strong><p style={{ margin: '4px 0', color: '#64748b', fontSize: '.78rem' }}>{description}</p>{url && <code style={{ display: 'block', width: '100%', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155', fontSize: '.7rem' }}>{url}</code>}</div><form action={action}><input type="hidden" name="leagueId" value={leagueId} /><input type="hidden" name="purpose" value={purpose} /><button type="submit" disabled={pending} className="birvo-btn-secondary">{pending ? 'Rotating…' : 'Rotate link'}</button></form></div>
    {(state?.error || state?.success) && <p role={state.error ? 'alert' : 'status'} style={{ margin: '9px 0 0', color: state.error ? '#991b1b' : '#176b45', fontSize: '.78rem', fontWeight: 750 }}>{state.error || state.success}</p>}
  </div>;
}

export default function PublicLinkControls({ leagueId, links }) {
  return <div style={{ display: 'grid', gap: 9 }}>
    <LinkControl leagueId={leagueId} purpose="standings" label="Public standings" description="Invalidates previously shared leaderboard URLs." url={links.standings} />
    <LinkControl leagueId={leagueId} purpose="tv" label="Clubhouse TV" description="Invalidates display URLs on every screen." url={links.tv} />
    <LinkControl leagueId={leagueId} purpose="player" label="Player registration and sign-in" description="Invalidates QR codes, join links, and player login links." url={links.player} />
  </div>;
}
