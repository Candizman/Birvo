'use client';

import { useActionState } from 'react';
import {
  inviteStaffAction,
  removeStaffAction,
  revokeStaffInvitationAction,
  updateStaffRoleAction,
} from './actions';
import { UsersIcon } from '../../../components/icons/GolfIcons';

const ROLE_LABELS = {
  course_owner: 'Course Owner', course_admin: 'Course Manager', admin: 'Course Manager',
  assistant_admin: 'Operations Assistant', scorekeeper: 'Scorekeeper', superadmin: 'Superadmin',
};

function ActionMessage({ state }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p role={state.error ? 'alert' : 'status'} style={{ margin: '10px 0 0', color: state.error ? '#9b2c2c' : '#176b45', fontSize: '0.82rem', fontWeight: 750 }}>
      {state.error || state.success}
    </p>
  );
}

function MemberActions({ member }) {
  const [roleState, roleAction, rolePending] = useActionState(updateStaffRoleAction, {});
  const [removeState, removeAction, removePending] = useActionState(removeStaffAction, {});
  if (member.role === 'course_owner') return <span style={{ color: '#64748b', fontSize: '0.78rem' }}>Protected owner</span>;
  return (
    <div>
      <form action={roleAction} style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <input type="hidden" name="membershipId" value={member.id} />
        <select name="role" defaultValue={member.role} aria-label={`Role for ${member.email}`} style={{ minHeight: '34px', border: '1px solid #cbd5e1', borderRadius: '7px', background: '#fff' }}>
          <option value="course_admin">Course Manager</option>
          <option value="assistant_admin">Operations Assistant</option>
          <option value="scorekeeper">Scorekeeper</option>
        </select>
        <button className="birvo-btn-secondary" disabled={rolePending}>{rolePending ? 'Saving…' : 'Save'}</button>
      </form>
      <form action={removeAction} style={{ marginTop: '7px', textAlign: 'right' }}>
        <input type="hidden" name="membershipId" value={member.id} />
        <button type="submit" disabled={removePending} style={{ border: 0, background: 'transparent', color: '#9b2c2c', cursor: 'pointer', fontWeight: 750 }}>
          {removePending ? 'Removing…' : 'Remove access'}
        </button>
      </form>
      <ActionMessage state={roleState.error ? roleState : removeState} />
    </div>
  );
}

function InvitationActions({ invitation }) {
  const [state, action, pending] = useActionState(revokeStaffInvitationAction, {});
  if (invitation.status !== 'pending') return <span style={{ color: '#9b2c2c', fontSize: '0.78rem' }}>Delivery failed — invite again</span>;
  return (
    <form action={action} style={{ textAlign: 'right' }}>
      <input type="hidden" name="invitationId" value={invitation.id} />
      <button type="submit" disabled={pending} style={{ border: 0, background: 'transparent', color: '#9b2c2c', cursor: 'pointer', fontWeight: 750 }}>
        {pending ? 'Revoking…' : 'Revoke invitation'}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export default function StaffAccessPanel({ staff }) {
  const [state, action, pending] = useActionState(inviteStaffAction, {});
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '1.5rem' }}>
      <section className="birvo-card" style={{ padding: '1.5rem', background: '#fff', overflowX: 'auto' }}>
        <h2 className="title-primary" style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>Authorized Club Staff</h2>
        <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.76rem', textTransform: 'uppercase' }}>
            <th style={{ padding: '10px 8px' }}>Email</th><th>Access</th><th>Status</th><th style={{ textAlign: 'right' }}>Controls</th>
          </tr></thead>
          <tbody>{staff.map(item => (
            <tr key={`${item.access_type}-${item.id}`} style={{ borderBottom: '1px solid var(--color-border-subtle)', verticalAlign: 'top' }}>
              <td style={{ padding: '14px 8px', fontWeight: 750 }}>{item.email}</td>
              <td style={{ padding: '14px 8px' }}>{ROLE_LABELS[item.role] || item.role}</td>
              <td style={{ padding: '14px 8px', color: item.status === 'active' || item.status === 'pending' ? '#176b45' : '#9b2c2c', fontWeight: 750, textTransform: 'capitalize' }}>{item.status}</td>
              <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                {item.access_type === 'member' ? <MemberActions member={item} /> : <InvitationActions invitation={item} />}
              </td>
            </tr>
          ))}</tbody>
        </table>
        {staff.length === 0 && <p style={{ color: '#64748b' }}>No staff access records yet.</p>}
      </section>

      <section className="birvo-card" style={{ padding: '1.5rem', height: 'fit-content', background: '#fff' }}>
        <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'var(--color-primary-light)', marginBottom: '1rem' }}><UsersIcon size={21} /></div>
        <h3 style={{ margin: '0 0 0.5rem' }}>Invite Staff Securely</h3>
        <p style={{ color: '#64748b', lineHeight: 1.55, fontSize: '0.88rem' }}>Invitations expire after seven days. Access begins only after the invited email signs in.</p>
        <form action={action} style={{ display: 'grid', gap: '12px', marginTop: '1rem' }}>
          <label><span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 750, marginBottom: 5 }}>Work email</span><input name="email" type="email" required autoComplete="email" placeholder="staff@yourclub.com" style={{ width: '100%', minHeight: 42, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 8 }} /></label>
          <label><span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 750, marginBottom: 5 }}>Role</span><select name="role" defaultValue="scorekeeper" style={{ width: '100%', minHeight: 42, padding: '0 10px', border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }}><option value="course_admin">Course Manager</option><option value="assistant_admin">Operations Assistant</option><option value="scorekeeper">Scorekeeper</option></select></label>
          <button type="submit" className="birvo-btn-primary" disabled={pending}>{pending ? 'Sending invitation…' : 'Send secure invitation'}</button>
        </form>
        <ActionMessage state={state} />
      </section>
    </div>
  );
}
