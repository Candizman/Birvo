import React from 'react';
import primitives from './primitives.module.css';
import styles from './statCard.module.css';

export default function StatCard({
  label,
  value,
  description,
  valueColor = '#111827',
  labelColor = 'var(--color-text-muted)',
  unit,
  className = ''
}) {
  return (
    <div className={`${primitives.card} ${styles.statCard} ${className}`}>
      <div className={styles.label} style={{ color: labelColor }}>
        {label}
      </div>
      <div className={styles.valueContainer}>
        <div className={styles.value} style={{ color: valueColor }}>
          {value}
        </div>
        {unit && <div className={styles.unit}>{unit}</div>}
      </div>
      {description && <div className={styles.description}>{description}</div>}
    </div>
  );
}
