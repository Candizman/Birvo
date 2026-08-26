import React from 'react';
import { TrophyIcon } from './icons/GolfIcons';

export default function Leaderboard({ results }) {
  const sortedResults = [...results].sort((a, b) => b.pointsEarned - a.pointsEarned);

  return (
    <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
        <TrophyIcon size={20} color="#059669" />
        <h2 className="title-primary" style={{ margin: 0, fontSize: '1.25rem' }}>Weekly Leaderboard</h2>
      </div>

      <div style={{ minWidth: '600px' }}>
        <table className="leaderboard-table tabular-nums" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <th style={{ textAlign: 'left', padding: '12px 10px', width: '60px' }}>Pos</th>
              <th style={{ textAlign: 'left', padding: '12px 10px' }}>Team / Player</th>
              <th style={{ textAlign: 'center', padding: '12px 10px' }}>Gross</th>
              <th style={{ textAlign: 'center', padding: '12px 10px' }}>Playing HI</th>
              <th style={{ textAlign: 'center', padding: '12px 10px' }}>Net Score</th>
              <th style={{ textAlign: 'right', padding: '12px 10px' }}>Points</th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.map((team, idx) => {
              const isFirst = team.rank === 1;
              return (
                <tr key={team.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: isFirst ? '#fefce8' : idx % 2 === 0 ? 'var(--color-bg-subtle)' : 'transparent' }}>
                  <td style={{ padding: '12px 10px' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      background: team.rank === 1 ? '#fef3c7' : team.rank === 2 ? '#f1f5f9' : team.rank === 3 ? '#ffedd5' : '#f8fafc',
                      border: team.rank === 1 ? '1px solid #f59e0b' : team.rank === 2 ? '1px solid #cbd5e1' : team.rank === 3 ? '1px solid #fdba74' : '1px solid #e2e8f0',
                      color: team.rank === 1 ? '#92400e' : team.rank === 2 ? '#334155' : team.rank === 3 ? '#9a3412' : 'var(--color-text-muted)',
                      fontWeight: 800,
                      fontSize: '0.82rem'
                    }}>
                      {team.rank}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, padding: '12px 10px', color: 'var(--color-text-main)' }}>{team.name}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-muted)' }}>{team.currentGross}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{team.handicap.toFixed(1)}</td>
                  <td style={{ padding: '12px 10px', textAlign: 'center', color: '#0284c7', fontWeight: 800 }}>{team.netScore.toFixed(1)}</td>
                  <td style={{ fontWeight: 900, color: '#059669', textAlign: 'right', padding: '12px 10px', fontSize: '1.1rem' }}>
                    {team.pointsEarned.toFixed(1)} <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>PTS</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
