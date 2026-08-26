import Link from 'next/link';
import styles from './alertBanner.module.css';

/**
 * Full-width alert banner with an action link.
 *
 * @param {{ children: React.ReactNode, actionHref: string, actionLabel: string, variant?: 'danger'|'warning'|'info', className?: string }} props
 */
export default function AlertBanner({ children, actionHref, actionLabel, variant = 'danger', className = '' }) {
  return (
    <div className={`${styles.banner} ${styles[variant] || styles.danger} ${className}`.trim()}>
      <span className={styles.message}>{children}</span>
      {actionHref && actionLabel && (
        <Link href={actionHref} className={styles.action}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
