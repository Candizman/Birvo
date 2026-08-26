'use client';

import { useState, useEffect } from 'react';
import {
  TrophyIcon,
  WindIcon,
  SparklesIcon
} from '../../../components/icons/GolfIcons';
import styles from './TVView.module.css';

export default function TVView({ tvData }) {
  const { league = {}, display = {}, sponsors = [], standings = [], currentWeek = 1, weather, playerAccessToken, isPreview = false } = tvData || {};
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 8;
  const totalPages = Math.ceil(standings.length / pageSize) || 1;
  const scrollSpeed = display?.auto_scroll_speed || 8;

  // Auto-scroll loop for 4K TV displays
  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, scrollSpeed * 1000);
    return () => clearInterval(interval);
  }, [totalPages, scrollSpeed]);

  const pagedStandings = standings.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const seasonLeader = standings[0] || null;

  return (
    <div className={styles.broadcast} style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #0c1626 0%, #060a12 100%)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      padding: '2rem 3rem 1.25rem',
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* ─── TOP BROADCAST HEADER ────────────────────────────────────────────────── */}
      <header className={styles.header} style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid rgba(16, 185, 129, 0.4)',
        paddingBottom: '1.25rem'
      }}>
        <div className={styles.brand} style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #059669, #047857)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.3)'
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.png" alt="Birvo TV" style={{ width: '44px', height: '44px', objectFit: 'contain' }} />
          </div>
          <div className={styles.brandCopy}>
            <div className={styles.titleRow} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{
                fontSize: '2.4rem',
                margin: 0,
                fontWeight: 900,
                letterSpacing: '-0.5px',
                color: '#ffffff'
              }}>
                {league.course_name || 'Birvo Golf Links'}
              </h1>
              <span style={{
                background: '#ef4444',
                color: 'white',
                fontSize: '0.75rem',
                fontWeight: 900,
                padding: '3px 10px',
                borderRadius: '4px',
                letterSpacing: '1px'
              }}>
                {isPreview ? 'DEMO BROADCAST' : 'BIRVO TV'}
              </span>
            </div>
            <div style={{ color: '#10b981', fontSize: '1.15rem', fontWeight: 800, marginTop: '2px' }}>
              {league.name || 'Birvo League'} • Week {currentWeek} Live Leaderboard
            </div>
          </div>
        </div>

        {/* Connected data and score-entry QR widget */}
        <div className={styles.headerTools} style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {weather && !weather.isEstimate && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              background: 'rgba(15, 23, 42, 0.8)',
              padding: '8px 20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'white' }}>{weather.tempF}°F</div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <WindIcon size={14} color="#38bdf8" /> Wind {weather.windMph} mph {weather.windDirection}
                </div>
              </div>
            </div>
          )}

          {/* QR Code widget */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(5, 150, 105, 0.2)',
            border: '1px solid #10b981',
            padding: '8px 16px',
            borderRadius: '12px'
          }}>
            <div style={{ width: '48px', height: '48px', background: 'white', padding: '3px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={league?.id && playerAccessToken ? `/api/qr?leagueId=${league.id}&access=${encodeURIComponent(playerAccessToken)}` : '/logo.png'} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ fontSize: '0.85rem', lineHeight: '1.3' }}>
              <strong style={{ color: '#10b981', display: 'block' }}>Mobile scorecard</strong>
              <span style={{ color: '#cbd5e1' }}>Scan to enter scores</span>
            </div>
          </div>
        </div>
      </header>

      {/* ─── MAIN LEADERBOARD BODY ──────────────────────────────────────────────── */}
      <main className={styles.main} style={{ flex: 1, margin: '2rem 0', display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2.5rem', alignItems: 'start' }}>

        {/* Left: Broadcast Leaderboard Table */}
        <div className={styles.leaderboard} style={{
          background: 'rgba(15, 23, 42, 0.85)',
          borderRadius: '18px',
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '1.5rem 2rem',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrophyIcon size={24} color="#10b981" />
              <h2 style={{ fontSize: '1.5rem', margin: 0, color: 'white', fontWeight: 800 }}>
                Season standings
              </h2>
            </div>
            {totalPages > 1 && (
              <span style={{ fontSize: '1rem', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 14px', borderRadius: '8px', fontWeight: 700 }}>
                Page {currentPage + 1} / {totalPages}
              </span>
            )}
          </div>

          {standings.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <p style={{ fontSize: '1.2rem' }}>No scores have been recorded for this league yet.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '1.35rem' }} className={`tabular-nums ${styles.table}`}>
              <thead>
                <tr style={{ color: '#94a3b8', borderBottom: '2px solid rgba(255,255,255,0.1)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  <th style={{ padding: '14px 16px', width: '90px' }}>Rank</th>
                  <th style={{ padding: '14px 16px' }}>Team / Player</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>HI</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>Weeks</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>Net Avg.</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Season Points</th>
                </tr>
              </thead>
              <tbody>
                {pagedStandings.map((t, idx) => {
                  const rank = t.seasonRank || (idx + 1);
                  const isFirst = rank === 1;
                  return (
                    <tr
                      key={t.id || idx}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        background: isFirst ? 'rgba(212, 175, 55, 0.12)' : idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        transition: 'all 0.3s'
                      }}
                    >
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '42px',
                          height: '42px',
                          borderRadius: '8px',
                          background: rank === 1 ? '#d4af37' : rank === 2 ? '#94a3b8' : rank === 3 ? '#b45309' : 'rgba(255,255,255,0.08)',
                          color: rank <= 3 ? '#080c14' : 'white',
                          fontWeight: 900,
                          fontSize: '1.2rem'
                        }}>
                          {rank}
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontWeight: 800, color: isFirst ? '#ffffff' : '#f1f5f9' }}>
                        {t.name}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>
                        {(t.currentHandicap !== undefined ? t.currentHandicap : (t.current_handicap || 0)).toFixed(1)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center', color: '#10b981', fontWeight: 800 }}>
                        {t.weeksPlayed ?? 0}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'center', color: '#38bdf8', fontWeight: 800 }}>
                        {t.avgNet != null ? t.avgNet.toFixed(1) : '-'}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', fontWeight: 900, color: isFirst ? '#f59e0b' : 'var(--color-primary)', fontSize: '1.65rem' }}>
                        {t.totalPoints || 0} <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>PTS</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right Column: Leader Spotlight & Sponsors */}
        <div className={styles.sidebar} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

          {/* Season Leader Spotlight Card */}
          {seasonLeader && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.25) 0%, rgba(15, 23, 42, 0.9) 100%)',
              border: '2px solid var(--color-primary)',
              borderRadius: '18px',
              padding: '1.75rem',
              textAlign: 'center',
              boxShadow: '0 15px 40px rgba(212, 175, 55, 0.25)'
            }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto' }}>
                <TrophyIcon size={32} color="#080c14" />
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 800, letterSpacing: '1px' }}>
                SEASON LEADER
              </div>
              <h3 style={{ fontSize: '1.8rem', margin: '0.5rem 0', color: 'white', fontWeight: 900 }}>
                {seasonLeader.name}
              </h3>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--color-primary)', margin: '0.5rem 0' }}>
                {seasonLeader.totalPoints || 0} Points
              </div>
              <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>
                Season net average: <strong style={{ color: '#38bdf8' }}>{seasonLeader.avgNet != null ? seasonLeader.avgNet.toFixed(1) : '-'}</strong>
              </div>
            </div>
          )}

          {/* Official Tournament Sponsors Loop */}
          {sponsors.length > 0 && (
            <div style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '18px',
              padding: '1.5rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '1rem', letterSpacing: '1px', fontWeight: 700 }}>
                CLUB PARTNERS
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {sponsors.map(s => (
                  <div
                    key={s.id}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      padding: '12px',
                      borderRadius: '10px',
                      fontWeight: 800,
                      color: 'white',
                      fontSize: '1.1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    {s.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.logo_url}
                        alt=""
                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                        style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'contain', background: 'white' }}
                      />
                    )}
                    <SparklesIcon size={16} color="#d4af37" /> {s.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── BOTTOM PGA TOUR TICKER ─────────────────────────────────────────────── */}
      {display?.show_announcements !== false && display?.show_announcements !== 0 && <footer className={styles.footer} style={{
        background: 'rgba(8, 12, 20, 0.95)',
        borderTop: '2px solid rgba(212, 175, 55, 0.5)',
        borderRadius: '14px',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        overflow: 'hidden',
        boxShadow: '0 0 30px rgba(0, 0, 0, 0.8)'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #d4af37, #f59e0b)',
          color: '#080c14',
          padding: '6px 14px',
          borderRadius: '6px',
          fontWeight: 900,
          fontSize: '0.9rem',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <SparklesIcon size={16} color="#080c14" /> LEAGUE ANNOUNCEMENT
        </div>
        <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '1.15rem', color: '#f8fafc', fontWeight: 600, display: 'inline-block' }}>
            {display?.announcement_text || 'Welcome to the Birvo live leaderboard. Scan the QR code to enter scores.'}
          </span>
        </div>
      </footer>}
    </div>
  );
}
