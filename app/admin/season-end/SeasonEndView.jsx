'use client'

import React, { useMemo, useState } from 'react';
import styles from './seasonEnd.module.css';
import { TrophyIcon, DownloadIcon } from '../../../components/icons/GolfIcons';
import RankBadge from '../../../components/ui/RankBadge';
import { generateCertificateAction, archiveLeagueAction } from './actions';

export default function SeasonEndView({ champion, runnerUp, standings, league, totalWeeks }) {
  const CONFETTI_COLORS = ['#fbbf24', '#f87171', '#60a5fa', '#34d399', '#a78bfa'];
  const confetti = Array.from({ length: 50 }).map((_, i) => ({
    id: i,
    left: `${(i * 7.3 + 2) % 100}%`,
    animationDuration: `${2 + (i % 5) * 0.4}s`,
    animationDelay: `${(i % 10) * 0.08}s`,
    backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length]
  }));
  const [certMessage, setCertMessage] = useState('');

  const handleGenerateCertificate = async () => {
    const formData = new FormData();
    const result = await generateCertificateAction(formData);
    setCertMessage(result.message);
  };

  const handleArchive = async () => {
    if (confirm('Are you sure you want to archive this league? This will lock it from further edits.')) {
      const formData = new FormData();
      await archiveLeagueAction(formData);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.confettiContainer}>
        {confetti.map(c => (
          <div
            key={c.id}
            className={styles.confetti}
            style={{
              left: c.left,
              animationDuration: c.animationDuration,
              animationDelay: c.animationDelay,
              backgroundColor: c.backgroundColor
            }}
          />
        ))}
      </div>

      <div className={styles.header}>
        <TrophyIcon size={64} color="#fbbf24" style={{ marginBottom: '1rem' }} />
        <h1 className={styles.title}>Season Champion</h1>
        <p className={styles.subtitle}>{league.name} - Season Complete ({totalWeeks} Weeks)</p>
      </div>

      <div className={styles.cardsContainer}>
        {champion && (
          <div className={styles.championCard}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <RankBadge rank={1} size={48} />
            </div>
            <div className={styles.teamName}>{champion.name}</div>
            <div className={styles.statsRow}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{champion.totalPoints}</span>
                <span className={styles.statLabel}>Points</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{champion.avgNet}</span>
                <span className={styles.statLabel}>Avg Net</span>
              </div>
            </div>
          </div>
        )}

        {runnerUp && (
          <div className={styles.runnerUpCard}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <RankBadge rank={2} size={48} />
            </div>
            <div className={styles.teamName}>{runnerUp.name}</div>
            <div className={styles.statsRow}>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{runnerUp.totalPoints}</span>
                <span className={styles.statLabel}>Points</span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statValue}>{runnerUp.avgNet}</span>
                <span className={styles.statLabel}>Avg Net</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.standingsSection}>
        <h2 className={styles.standingsTitle}>Final Standings</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Rank</th>
              <th className={styles.th}>Team</th>
              <th className={styles.th}>Total Points</th>
              <th className={styles.th}>Avg Net</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((team, index) => (
              <tr key={team.id} className={styles.tr}>
                <td className={styles.td}>
                  <RankBadge rank={index + 1} />
                </td>
                <td className={styles.td} style={{ fontWeight: 600 }}>{team.name}</td>
                <td className={styles.td}>{team.totalPoints}</td>
                <td className={styles.td}>{team.avgNet}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.actions}>
        <button className="birvo-btn-secondary" onClick={handleGenerateCertificate}>
          <DownloadIcon size={18} style={{ marginRight: '8px' }} />
          Download Certificate
        </button>
        <button className="birvo-btn-primary" onClick={handleArchive}>
          Archive League
        </button>
      </div>
      {certMessage && <p style={{ marginTop: '1rem', color: 'var(--color-primary)' }}>{certMessage}</p>}
    </div>
  );
}
