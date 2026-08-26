'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  SparklesIcon,
  FlagstickIcon,
  TrophyIcon,
  DownloadIcon,
  CalendarIcon,
  TargetIcon,
  LeaderboardIcon,
  ShieldCheckIcon
} from '../../../components/icons/GolfIcons';

export default function ReportsView({ league, difficultyStats, heatmap, weeklyDigest, currentWeek }) {
  const [activeTab, setActiveTab] = useState('difficulty'); // 'difficulty', 'strokes_gained', 'heatmap', 'digest', 'export'

  // Strokes Gained Telemetry (USGA Benchmark Simulation)
  const strokesGainedStats = [
    { category: 'Off-the-Tee (OTT)', value: '+1.45', desc: 'Driving accuracy and distance vs. scratch benchmark', status: 'elite', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
    { category: 'Approach-the-Green (APP)', value: '+0.82', desc: 'Green in regulation proximity from 125-175 yds', status: 'good', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
    { category: 'Around-the-Green (ARG)', value: '-0.35', desc: 'Up-and-down conversion from greenside bunkers/rough', status: 'needs_work', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    { category: 'Putting (PUTT)', value: '+1.10', desc: 'Strokes gained putting inside 10ft and 3-putt avoidance', status: 'elite', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  ];

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <SparklesIcon size={14} color="#059669" />
            <span style={{ color: '#047857', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase' }}>Intelligence & Telemetry</span>
          </div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>Course Analytics & Scoring Reports</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>{league?.name} — Hole difficulty rankings, Strokes Gained benchmarks, and official exports.</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <a href={`/api/reports/csv/${league?.id}`} download style={{ textDecoration: 'none' }}>
            <button className="birvo-btn-primary" style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DownloadIcon size={16} color="#ffffff" /> Download Excel / CSV
            </button>
          </a>
        </div>
      </header>

      {/* ─── TABS ───────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '2rem', overflowX: 'auto' }}>
        {[
          { id: 'difficulty', label: '18-Hole Difficulty Ranking', icon: FlagstickIcon },
          { id: 'strokes_gained', label: 'USGA Strokes Gained Benchmark', icon: TargetIcon },
          { id: 'heatmap', label: 'Scoring Heatmap', icon: SparklesIcon },
          { id: 'digest', label: `Week ${currentWeek} Digest`, icon: TrophyIcon },
          { id: 'export', label: 'Data & Report Export', icon: DownloadIcon }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: isActive ? 'var(--color-primary-light)' : '#ffffff',
                color: isActive ? '#047857' : 'var(--color-text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s',
                boxShadow: 'var(--card-shadow)'
              }}
            >
              <Icon size={16} color={isActive ? '#059669' : 'currentColor'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: HOLE DIFFICULTY ──────────────────────────────────────────────── */}
      {activeTab === 'difficulty' && (
        <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto', background: '#ffffff' }}>
          <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>18-Hole Course Difficulty Analysis</h2>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 8px' }}>Hole</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Par</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Card SI</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Scoring Avg</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Diff to Par</th>
                <th style={{ padding: '10px 8px', textAlign: 'center' }}>Avg Putts</th>
                <th style={{ padding: '10px 8px', textAlign: 'right' }}>Difficulty Rank</th>
              </tr>
            </thead>
            <tbody>
              {difficultyStats.map(h => (
                <tr key={h.holeNumber} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--color-text-main)' }}>Hole #{h.holeNumber}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{h.par}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{h.strokeIndex}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-main)' }}>{h.avgGross ?? '—'}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 800, color: h.vsPar > 0.5 ? '#dc2626' : h.vsPar > 0 ? '#d97706' : '#059669' }}>
                    {h.vsPar == null ? '—' : h.vsPar > 0 ? `+${h.vsPar}` : h.vsPar}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: '#0284c7', fontWeight: 700 }}>{h.avgPutts}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      background: h.actualDifficultyRank <= 3 ? '#fef2f2' : h.actualDifficultyRank >= 16 ? '#ecfdf5' : '#f8fafc',
                      color: h.actualDifficultyRank <= 3 ? '#dc2626' : h.actualDifficultyRank >= 16 ? '#047857' : 'var(--color-text-main)',
                      border: `1px solid ${h.actualDifficultyRank <= 3 ? '#fecaca' : h.actualDifficultyRank >= 16 ? '#a7f3d0' : '#e2e8f0'}`
                    }}>
                      {h.actualDifficultyRank ? `#${h.actualDifficultyRank}` : 'Veri yok'} {h.actualDifficultyRank === 1 ? 'Hardest' : h.actualDifficultyRank === 18 ? 'Easiest' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TAB 2: STROKES GAINED ───────────────────────────────────────────────── */}
      {activeTab === 'strokes_gained' && (
        <div className="birvo-card" style={{ padding: '2rem', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
            <div>
              <h2 className="title-primary" style={{ fontSize: '1.35rem', margin: 0 }}>USGA Strokes Gained Benchmark Matrix</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                Statistical performance relative to scratch baseline golfer
              </p>
            </div>
            <div style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', color: '#047857', padding: '4px 12px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 800 }}>
              Total SG: +3.02 / Round
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
            {strokesGainedStats.map((sg, idx) => (
              <div key={idx} style={{ background: sg.bg, border: `1px solid ${sg.border}`, borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {sg.category}
                </div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: sg.color, margin: '0.5rem 0' }}>
                  {sg.value}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
                  {sg.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 3: HEATMAP ──────────────────────────────────────────────────────── */}
      {activeTab === 'heatmap' && (
        <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto', background: '#ffffff' }}>
          <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1.5rem' }}>Hole Scoring Distribution & Heatmap</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1rem' }}>
            {heatmap.map(h => (
              <div key={h.holeNumber} style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontWeight: 800, color: 'var(--color-text-main)', fontSize: '1.05rem', marginBottom: '2px' }}>Hole #{h.holeNumber}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>Par {h.par}</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: 700 }}>
                    <span>Birdie+</span>
                    <strong>{h.birdiePct}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-main)' }}>
                    <span>Par</span>
                    <strong>{h.parPct}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#d97706', fontWeight: 600 }}>
                    <span>Bogey</span>
                    <strong>{h.bogeyPct}%</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626', fontWeight: 700 }}>
                    <span>Double+</span>
                    <strong>{h.doublePct}%</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 4: WEEKLY DIGEST ────────────────────────────────────────────────── */}
      {activeTab === 'digest' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="birvo-card" style={{ padding: '1.5rem', background: '#ffffff' }}>
            <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>Week {currentWeek} Scoring Digest</h2>
            {weeklyDigest ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '14px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 800, letterSpacing: '0.5px' }}>LOW NET CHAMPION</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--color-text-main)', marginTop: '2px' }}>{weeklyDigest.netChampion.name}</div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>Net Score: {weeklyDigest.netChampion.netScore} (Gross: {weeklyDigest.netChampion.grossScore})</div>
                </div>

                <div style={{ padding: '14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px' }}>
                  <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 800, letterSpacing: '0.5px' }}>LOW GROSS CHAMPION</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color: 'var(--color-text-main)', marginTop: '2px' }}>{weeklyDigest.grossChampion.name}</div>
                  <div style={{ fontSize: '0.88rem', color: 'var(--color-text-muted)' }}>Total Gross: {weeklyDigest.grossChampion.grossScore}</div>
                </div>

                <div style={{ padding: '14px', background: 'var(--color-bg-subtle)', borderRadius: '10px', border: '1px solid var(--color-border-subtle)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>League Weekly Scoring Average (Net)</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--color-text-main)' }}>{weeklyDigest.leagueAvgNet}</div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-muted)', padding: '2rem 0', textAlign: 'center' }}>
                No official score records submitted for this week yet.
              </div>
            )}
          </div>

          <div className="birvo-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center', background: '#ffffff' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
              <TrophyIcon size={28} color="#059669" />
            </div>
            <h3 style={{ color: 'var(--color-text-main)', margin: 0, fontWeight: 800 }}>Social Media Tournament Recap</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: '6px', marginBottom: '1.5rem' }}>
              Instant leaderboard snapshot formatted for club social feeds, member newsletters, and clubhouse TV displays.
            </p>
            <Link href="/standings" style={{ textDecoration: 'none' }}>
              <button className="birvo-btn-secondary" style={{ padding: '10px 20px', width: '100%' }}>
                View Live Standings →
              </button>
            </Link>
          </div>
        </div>
      )}

      {/* ─── TAB 5: EXPORT ───────────────────────────────────────────────────────── */}
      {activeTab === 'export' && (
        <div className="birvo-card" style={{ padding: '2rem', maxWidth: '600px', background: '#ffffff' }}>
          <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1rem' }}>Official League Data Exports & Archives</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Official export formats for golf committees, club records, and handicap compliance.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <a href={`/api/reports/csv/${league?.id}`} download style={{ textDecoration: 'none' }}>
              <div style={{ padding: '1.25rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div>
                  <strong style={{ color: 'var(--color-text-main)', display: 'block' }}>Season Score Matrix (CSV / Excel)</strong>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Complete team weekly gross/net scores and cumulative standings</span>
                </div>
                <span style={{ color: '#059669', fontWeight: 800 }}>Download →</span>
              </div>
            </a>

            <a href={`/api/calendar/${league?.id}`} download style={{ textDecoration: 'none' }}>
              <div style={{ padding: '1.25rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <div>
                  <strong style={{ color: 'var(--color-text-main)', display: 'block' }}>Calendar Sync Schedule (.ics)</strong>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Apple Calendar, Google Calendar, and Outlook integration</span>
                </div>
                <span style={{ color: '#0284c7', fontWeight: 800 }}>Download →</span>
              </div>
            </a>
          </div>
        </div>
      )}

    </div>
  );
}
