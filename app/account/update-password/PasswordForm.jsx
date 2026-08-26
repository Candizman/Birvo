'use client';

import { useActionState } from 'react';
import { updatePassword } from './actions';
import styles from '../../login/login.module.css';

export default function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, {});
  return (
    <form action={action} className={styles.form}>
      <label><span>New password</span><input name="password" type="password" required minLength={12} autoComplete="new-password" /></label>
      <label><span>Confirm new password</span><input name="confirmation" type="password" required minLength={12} autoComplete="new-password" /></label>
      {state?.error && <div className={styles.error} role="alert">{state.error}</div>}
      <button type="submit" className="birvo-btn-primary" disabled={pending}>{pending ? 'Updating password…' : 'Set new password'}</button>
    </form>
  );
}
