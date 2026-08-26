import React from 'react';
import styles from './rankBadge.module.css';

export default function RankBadge({ rank, size = 32 }) {
  if (rank === 1) {
    return (
      <div
        className={styles.circle}
        style={{
          width: size,
          height: size,
          backgroundColor: '#fef3c7',
          borderColor: '#fde68a',
          color: '#92400e',
          fontSize: size * 0.45
        }}
      >
        {rank}
      </div>
    );
  }

  if (rank === 2) {
    return (
      <div
        className={styles.circle}
        style={{
          width: size,
          height: size,
          backgroundColor: '#f1f5f9',
          borderColor: '#e2e8f0',
          color: '#334155',
          fontSize: size * 0.45
        }}
      >
        {rank}
      </div>
    );
  }

  if (rank === 3) {
    return (
      <div
        className={styles.circle}
        style={{
          width: size,
          height: size,
          backgroundColor: '#ffedd5',
          borderColor: '#fed7aa',
          color: '#9a3412',
          fontSize: size * 0.45
        }}
      >
        {rank}
      </div>
    );
  }

  return (
    <div
      className={styles.plain}
      style={{
        color: '#64748b',
        fontSize: size * 0.5
      }}
    >
      #{rank}
    </div>
  );
}
