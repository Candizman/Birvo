'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  TrophyIcon,
  FlagstickIcon,
  SparklesIcon,
  UserIcon,
  CalendarIcon
} from '../../components/icons/GolfIcons';
import SideGamePanel from '../../components/league/SideGamePanel';
import { weekFormatColumn } from '../../components/league/weekFormatColumn';

export default function StandingsView({ standingsData, playerAccessToken = null, isPreview = false }) {
  const [activeTab, setActiveTab] = useState('overall'); // 'overall' or weekNumber (number)

  if (!standingsData) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <h2 style={{ color: 'var(--color-text-main)' }}>League link not found</h2>
        <p style={{ color: 'var(--color-text-muted)' }}>The link may have expired, the league may be inactive, or the access token may be invalid.</p>
      </div>
    );
  }

  const { league, totalActiveTeams, seasonStandings, weeklyResultsList, summary } = standingsData;

  const getRankBadge = (rank) => {
    if (rank === 1) return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: '#fef3c7',
        border: '1px solid #fde68a',
        color: '#92400e',
        fontWeight: 900,
        fontSize: '0.85rem'
      }}>
        1
      </span>
    );
    if (rank === 2) return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        color: '#334155',
        fontWeight: 900,
        fontSize: '0.85rem'
      }}>
        2
      </span>
    );
    if (rank === 3) return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: '#ffedd5',
        border: '1px solid #fed7aa',
        color: '#9a3412',
        fontWeight: 900,
        fontSize: '0.85rem'
      }}>
        3
      </span>
    );
    return <span style={{ color: 'var(--color-text-muted)', fontWeight: 700, paddingLeft: '8px', fontSize: '0.88rem' }}>#{rank}</span>;
  };

  const currentWeekMatch = weeklyResultsList.find(w => w.weekNumber === activeTab);

  const formatColumn = weekFormatColumn(currentWeekMatch?.scoringBasis);

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '1rem clamp(0.75rem, 3vw, 1.5rem) 4rem' }}>

      {/* ─── STICKY FLOATING HEADER BAR ────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: '1rem', zIndex: 100, marginBottom: '2rem' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.85rem 1.5rem',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--color-border)',
          borderRadius: 'clamp(18px, 5vw, 9999px)',
          flexWrap: 'wrap',
          gap: '0.75rem',
          boxShadow: '0 8px 30px -4px rgba(0, 0, 0, 0.07)'
        }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.5px' }}>
              Bir<span style={{ color: 'var(--color-primary)' }}>vo</span>
            </span>
            <span style={{ fontSize: '0.75rem', background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: '9999px', fontWeight: 800 }}>
              STANDINGS
            </span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link className="birvo-btn-secondary" href={`/player/login?leagueId=${league.id}${playerAccessToken ? `&access=${encodeURIComponent(playerAccessToken)}` : ''}`} style={{ padding: '7px 14px', fontSize: '0.84rem' }}>
              Player sign in
            </Link>
            <Link className="birvo-btn-primary" href="/admin" style={{ padding: '7px 16px', fontSize: '0.84rem' }}>
              Admin →
            </Link>
          </div>
        </div>
      </div>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '5px 16px', borderRadius: '9999px', marginBottom: '1rem' }}>
          <TrophyIcon size={16} color="#059669" />
          <span style={{ color: '#047857', fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isPreview ? 'Demo league standings' : 'League standings'}</span>
        </div>
        <h1 style={{ fontSize: '2.4rem', margin: '0 0 0.5rem 0', fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>{league.name}</h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem', margin: 0 }}>
          {totalActiveTeams} active teams • Current week: {league.current_week}
        </p>
      </header>

      {/* ─── KPI CARDS ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2.5rem' }}>
        <div className="birvo-card" style={{ padding: '1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px' }}>
          <div style={{ color: '#b45309', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.5rem' }}>
            SEASON LEADER
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--color-text-main)' }}>
            {summary.leader ? summary.leader.name : '-'}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            {summary.leader ? `${summary.leader.totalPoints} season points` : ''}
          </div>
        </div>

        <div className="birvo-card" style={{ padding: '1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px' }}>
          <div style={{ color: '#047857', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.5rem' }}>
            ACTIVE TEAMS
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-text-main)' }}>
            {totalActiveTeams}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>League roster</div>
        </div>

        <div className="birvo-card" style={{ padding: '1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px' }}>
          <div style={{ color: '#0369a1', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.5rem' }}>
            AVERAGE NET SCORE
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0284c7' }}>
            {summary.leagueAvgNet !== null ? summary.leagueAvgNet : '-'}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>Season average</div>
        </div>

        <div className="birvo-card" style={{ padding: '1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px' }}>
          <div style={{ color: '#065f46', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '0.5rem' }}>
            COMPLETED WEEKS
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#059669' }}>
            {summary.completedWeeks} / {summary.seasonLengthWeeks}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>Weeks with completed scoring</div>
        </div>
      </div>

      {/* ─── TABS ───────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('overall')}
          style={{
            padding: '9px 18px',
            borderRadius: '9999px',
            border: activeTab === 'overall' ? '1px solid #059669' : '1px solid var(--color-border)',
            background: activeTab === 'overall' ? '#059669' : '#ffffff',
            color: activeTab === 'overall' ? '#ffffff' : 'var(--color-text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            fontSize: '0.88rem',
            boxShadow: 'var(--card-shadow)',
            transition: 'all 0.15s'
          }}
        >
          Season standings
        </button>

        {weeklyResultsList.map(w => (
          <button
            key={w.weekNumber}
            onClick={() => setActiveTab(w.weekNumber)}
            style={{
              padding: '9px 16px',
              borderRadius: '9999px',
              border: activeTab === w.weekNumber ? '1px solid #059669' : '1px solid var(--color-border)',
              background: activeTab === w.weekNumber ? '#059669' : '#ffffff',
              color: activeTab === w.weekNumber ? '#ffffff' : 'var(--color-text-muted)',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '0.88rem',
              boxShadow: 'var(--card-shadow)',
              transition: 'all 0.15s'
            }}
          >
            Week {w.weekNumber} {w.matchStatus === 'rained_out' ? '(Postponed)' : ''}
          </button>
        ))}
      </div>

      {/* ─── TABLE CONTENT ──────────────────────────────────────────────────────── */}
      {activeTab === 'overall' ? (
        <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto', background: '#ffffff', borderRadius: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
            <TrophyIcon size={18} color="#059669" />
            <h2 className="title-primary" style={{ fontSize: '1.15rem', margin: 0 }}>Season point totals</h2>
          </div>

          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '12px 10px', width: '70px' }}>Rank</th>
                <th style={{ padding: '12px 10px' }}>Team / Player</th>
                <th style={{ padding: '12px 10px', textAlign: 'center' }}>Weeks</th>
                <th style={{ padding: '12px 10px', textAlign: 'center' }}>Current HI</th>
                <th style={{ padding: '12px 10px', textAlign: 'center' }}>Gross Avg.</th>
                <th style={{ padding: '12px 10px', textAlign: 'center' }}>Net Avg.</th>
                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total Points</th>
              </tr>
            </thead>
            <tbody>
              {seasonStandings.map((team, idx) => {
                const isFirst = team.seasonRank === 1;
                return (
                  <tr key={team.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: isFirst ? '#fefce8' : idx % 2 === 0 ? 'var(--color-bg-subtle)' : 'transparent' }}>
                    <td style={{ padding: '12px 10px' }}>{getRankBadge(team.seasonRank)}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                      {team.name} {team.ghostRounds > 0 && <span title="Rounds using a league-average ghost score" style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: '.68rem' }}>{team.ghostRounds} GHOST</span>}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{team.weeksPlayed}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{team.currentHandicap.toFixed(1)}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{team.avgGross !== null ? team.avgGross : '-'}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: '#0284c7', fontWeight: 700 }}>{team.avgNet !== null ? team.avgNet : '-'}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 900, fontSize: '1.15rem', color: isFirst ? '#d97706' : '#059669' }}>
                      {team.totalPoints.toFixed(1)} <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>PTS</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto', background: '#ffffff', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
            <h2 className="title-primary" style={{ fontSize: '1.15rem', margin: 0 }}>
              Week {activeTab} results and points
            </h2>
            {currentWeekMatch && (
              <span style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                Scores entered for {currentWeekMatch.scoresEnteredCount} / {currentWeekMatch.totalActiveTeams} teams
              </span>
            )}
          </div>

          {currentWeekMatch && currentWeekMatch.matchStatus === 'rained_out' ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#dc2626' }}>
              This week was postponed due to weather conditions.
            </div>
          ) : currentWeekMatch && currentWeekMatch.results.length > 0 ? (
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 10px', width: '70px' }}>Rank</th>
                  <th style={{ padding: '12px 10px' }}>Team / Player</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>Gross</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>Handicap</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>Net Score</th>
                  {formatColumn && (
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>{formatColumn.header}</th>
                  )}
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Points Earned</th>
                </tr>
              </thead>
              <tbody>
                {[...currentWeekMatch.results].sort((a, b) => (b.pointsEarned || 0) - (a.pointsEarned || 0)).map((team, idx) => (
                  <tr key={team.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: idx % 2 === 0 ? 'var(--color-bg-subtle)' : 'transparent' }}>
                    <td style={{ padding: '12px 10px' }}>{getRankBadge(team.rank)}</td>
                    <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                      {team.name} {team.isGhost && <span title="League-average ghost score" style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: '.68rem' }}>GHOST</span>}
                      {team.playedBySubstitute && <span title="Played by a substitute, so the round scores for the league but is left out of this team's handicap" style={{ marginLeft: 6, padding: '2px 6px', borderRadius: 999, background: '#fffbeb', color: '#b45309', fontSize: '.68rem' }}>SUB</span>}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{team.currentGross}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{team.handicap !== null ? team.handicap.toFixed(1) : '-'}</td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', color: '#0284c7', fontWeight: 700 }}>{team.netScore !== null ? team.netScore.toFixed(1) : '-'}</td>
                    {formatColumn && (
                      <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-main)' }}>
                        {formatColumn.value(team)}
                      </td>
                    )}
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 900, fontSize: '1.15rem', color: '#059669' }}>
                      {team.pointsEarned.toFixed(1)} <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>PTS</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No scorecards have been recorded for this week yet.
            </div>
          )}

          {/* The league's format could not be applied to this round, and saying so
              is better than showing a net ranking as though it were stableford. */}
          {currentWeekMatch?.holeDataMissing && currentWeekMatch.scoresEnteredCount > 0 && (
            <p style={{ margin: '1rem 0 0', fontSize: '.82rem', color: '#92400e', background: '#fef3c7',
                        border: '1px solid #fde68a', borderRadius: '10px', padding: '.6rem .9rem' }}>
              {summary.format.label} is scored hole by hole. This round has only total
              scores, so it was ranked on net.
            </p>
          )}
        </div>
      )}

      {activeTab !== 'overall' && <SideGamePanel sideGame={currentWeekMatch?.sideGame} />}

      {/* ─── NAVIGATION FOOTER ───────────────────────────────────────────────────── */}
      <footer style={{ marginTop: '3rem', textAlign: 'center', display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link className="birvo-btn-secondary" href={`/player/login?leagueId=${league.id}${playerAccessToken ? `&access=${encodeURIComponent(playerAccessToken)}` : ''}`} style={{ padding: '10px 20px' }}>
          Player score entry
        </Link>
        <Link className="birvo-btn-primary" href="/admin" style={{ padding: '10px 22px' }}>
          Admin dashboard
        </Link>
      </footer>

    </div>
  );
}
