'use client';

import { useActionState } from 'react';
import { closeWorkspace, reopenWorkspace, purgeWorkspace } from './actions';

/**
 * Closing and permanently removing a workspace.
 *
 * Two steps, and the second one asks for the course name in full. A season is a
 * lot of evenings, and a workspace that has been deleted cannot be got back.
 */
export default function WorkspaceLifecycle({ courseName, accountStatus, closedAt }) {
  const [closeState, closeAction, closing] = useActionState(closeWorkspace, null);
  const [reopenState, reopenAction, reopening] = useActionState(reopenWorkspace, null);
  const [purgeState, purgeAction, purging] = useActionState(purgeWorkspace, null);

  const isClosed = accountStatus === 'closed';
  const message = purgeState?.error || closeState?.error || reopenState?.error
    || purgeState?.message || closeState?.message || reopenState?.message;
  const isError = Boolean(purgeState?.error || closeState?.error || reopenState?.error);

  return (
    <div style={{ border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '14px', padding: '1.5rem' }}>
      <h3 style={{ margin: '0 0 .4rem', fontSize: '1.05rem', fontWeight: 800, color: '#991b1b' }}>
        {isClosed ? 'This workspace is closed' : 'Close this workspace'}
      </h3>
      <p style={{ margin: '0 0 1.25rem', color: '#7f1d1d', fontSize: '.88rem', lineHeight: 1.6, maxWidth: '640px' }}>
        {isClosed
          ? `Closed${closedAt ? ` on ${new Date(closedAt).toLocaleDateString()}` : ''}. Nothing has been deleted yet — reopen it to carry on, or remove it for good below. Closed workspaces are removed automatically after thirty days.`
          : 'Closing stops the season and hides the workspace, and can be undone. Nothing is deleted until you remove it afterwards.'}
      </p>

      {message && (
        <p role={isError ? 'alert' : 'status'} style={{
          margin: '0 0 1rem', padding: '.7rem 1rem', borderRadius: '10px', fontSize: '.86rem', fontWeight: 700,
          background: isError ? '#fee2e2' : '#ecfdf5',
          color: isError ? '#991b1b' : '#047857',
          border: `1px solid ${isError ? '#fecaca' : '#a7f3d0'}`,
        }}>
          {message}
        </p>
      )}

      {!isClosed && (
        <form action={closeAction}>
          <button type="submit" disabled={closing} className="birvo-btn-secondary"
            style={{ borderColor: '#fca5a5', color: '#b91c1c', fontWeight: 800 }}>
            {closing ? 'Closing…' : 'Close workspace'}
          </button>
        </form>
      )}

      {isClosed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <form action={reopenAction}>
            <button type="submit" disabled={reopening} className="birvo-btn-secondary" style={{ fontWeight: 800 }}>
              {reopening ? 'Reopening…' : 'Reopen workspace'}
            </button>
          </form>

          <form action={purgeAction} style={{ borderTop: '1px solid #fecaca', paddingTop: '1.25rem' }}>
            <label htmlFor="confirmName" style={{ display: 'block', marginBottom: '.5rem', color: '#7f1d1d', fontSize: '.86rem', fontWeight: 700 }}>
              Remove permanently. Every league, team, scorecard and handicap in this
              workspace goes with it, and none of it can be recovered. Type{' '}
              <strong>{courseName}</strong> to confirm.
            </label>
            <input type="hidden" name="courseName" value={courseName} />
            <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
              <input
                id="confirmName"
                name="confirmName"
                type="text"
                autoComplete="off"
                placeholder={courseName}
                style={{
                  flex: '1 1 240px', maxWidth: '340px', padding: '10px 14px', borderRadius: '10px',
                  border: '1px solid #fca5a5', background: '#ffffff', color: '#111827',
                  fontSize: '.95rem', fontWeight: 700, outline: 'none',
                }}
              />
              <button type="submit" disabled={purging}
                style={{
                  padding: '10px 20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                  background: '#b91c1c', color: '#ffffff', fontWeight: 800, fontSize: '.92rem',
                }}>
                {purging ? 'Removing…' : 'Remove for good'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
