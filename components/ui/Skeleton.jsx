import styles from './primitives.module.css';

export function Skeleton({ width = '100%', height = '1rem', className = '' }) {
  return <span className={`${styles.skeleton} ${className}`.trim()} style={{ width, height }} aria-hidden="true" />;
}

export function LoadingScreen({ label = 'Loading content' }) {
  return (
    <section className={styles.loadingScreen} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className={styles.loadingHeader}>
        <Skeleton width="9rem" height="1.6rem" />
        <Skeleton width="min(100%, 28rem)" height="2.7rem" />
      </div>
      <div className={styles.loadingGrid}>
        {[0, 1, 2, 3].map(item => (
          <div className={styles.loadingCard} key={item}>
            <Skeleton width="45%" height="0.8rem" />
            <Skeleton width="72%" height="1.8rem" />
            <Skeleton width="100%" height="0.75rem" />
          </div>
        ))}
      </div>
    </section>
  );
}
