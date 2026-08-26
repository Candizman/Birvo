'use client';

import { useEffect } from 'react';
import styles from './primitives.module.css';

export default function ErrorState({ error, retry, area = 'this page' }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className={styles.errorState} role="alert" aria-labelledby="route-error-title">
      <p className={styles.errorReference}>BIRVO RECOVERY</p>
      <h1 id="route-error-title">We could not load {area}.</h1>
      <p>Your data was not changed. The issue may be temporary, so you can safely try the request again.</p>
      <button type="button" className="birvo-btn-primary" onClick={() => retry()}>Try again</button>
      {error?.digest && <p className={styles.errorReference}>Reference: {error.digest}</p>}
    </section>
  );
}
