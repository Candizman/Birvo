import React from 'react';
import Badge from './Badge';
import styles from './scoreFeed.module.css';

export default function ScoreFeed({ scores = [], emptyMessage = 'No recent score entries.' }) {
  if (!scores || scores.length === 0) {
    return (
      <div className={styles.emptyMessage}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={styles.feedContainer}>
      {scores.map((score, index) => {
        const isVerified = score.attestation_status === 'attested';

        return (
          <div key={index} className={styles.feedItem}>
            <div className={styles.itemContent}>
              <div className={styles.teamName}>
                {score.team_name}
              </div>
              <div className={styles.scoreDetails}>
                Gross: <strong>{score.gross_score ?? '-'}</strong> • Handicap: {score.current_handicap == null ? '-' : Number(score.current_handicap).toFixed(1)} • Net: <strong>{score.net_score == null ? '-' : Number(score.net_score).toFixed(1)}</strong>
              </div>
            </div>
            <div className={styles.badgeContainer}>
              <Badge variant={isVerified ? 'success' : 'warning'}>
                {isVerified ? 'Verified' : 'Pending'}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
