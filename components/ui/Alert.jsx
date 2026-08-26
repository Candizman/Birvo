import styles from './primitives.module.css';

const VARIANTS = {
  info: '',
  warning: styles.alertWarning,
  danger: styles.alertDanger,
};

export default function Alert({ variant = 'info', children, role, className = '' }) {
  const resolvedRole = role || (variant === 'danger' ? 'alert' : 'status');
  return (
    <div className={`${styles.alert} ${VARIANTS[variant] || ''} ${className}`.trim()} role={resolvedRole}>
      <span className={styles.alertDot} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
