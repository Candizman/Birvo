import styles from './primitives.module.css';

const VARIANTS = {
  neutral: '',
  success: styles.badgeSuccess,
  warning: styles.badgeWarning,
  danger: styles.badgeDanger,
};

export default function Badge({ variant = 'neutral', children, className = '' }) {
  return <span className={`${styles.badge} ${VARIANTS[variant] || ''} ${className}`.trim()}>{children}</span>;
}
