'use client';

import { useActionState, useState } from 'react';
import { generateFixturesAction, addSubstituteAction, updateRSVPAction } from './actions';
import {
  CalendarIcon,
  UsersIcon,
  DownloadIcon,
  SparklesIcon,
  FlagstickIcon,
  DollarSignIcon,
  PrinterIcon
} from '../../../components/icons/GolfIcons';
import Link from 'next/link';
import GhostManager from './GhostManager';

const RSVP_PRESENTATION = {
  attending: { label: 'Attending', background: '#ecfdf5', color: '#047857', border: '#a7f3d0' },
  not_attending: { label: 'Not Attending', background: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  maybe: { label: 'Maybe', background: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  needs_sub: { label: 'Needs Substitute', background: '#fef3c7', color: '#92400e', border: '#fde68a' },
  unknown: { label: 'No Response', background: '#f8fafc', color: '#475569', border: '#cbd5e1' },
};

function RSVPForm({ teams, currentWeek }) {
  const [state, formAction, pending] = useActionState(updateRSVPAction, null);

  return (
    <form action={formAction} style={{ padding: '1rem', marginBottom: '1.5rem', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '0.75rem', alignItems: 'end' }}>
        <div>
          <label htmlFor="rsvp-team" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px', color: 'var(--color-text-main)' }}>Team</label>
          <select id="rsvp-team" name="teamId" required defaultValue="" style={{ width: '100%', padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff' }}>
            <option value="" disabled>Select a team</option>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="rsvp-status" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px', color: 'var(--color-text-main)' }}>Week {currentWeek} Status</label>
          <select id="rsvp-status" name="status" defaultValue="attending" style={{ width: '100%', padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff' }}>
            <option value="attending">Attending</option>
            <option value="not_attending">Not Attending</option>
            <option value="maybe">Maybe</option>
            <option value="needs_sub">Needs Substitute</option>
            <option value="unknown">No Response</option>
          </select>
        </div>
        <div>
          <label htmlFor="rsvp-note" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: '5px', color: 'var(--color-text-main)' }}>Operations Note</label>
          <input id="rsvp-note" name="note" maxLength={500} placeholder="Optional note for the pro shop" style={{ width: '100%', padding: '9px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#ffffff' }} />
        </div>
        <button type="submit" disabled={pending} className="birvo-btn-primary" style={{ padding: '10px 16px', whiteSpace: 'nowrap', opacity: pending ? 0.65 : 1 }}>
          {pending ? 'Saving…' : 'Save RSVP'}
        </button>
      </div>
      <div aria-live="polite" style={{ minHeight: '1.25rem', marginTop: '0.5rem', fontSize: '0.82rem', color: state?.error ? '#b91c1c' : '#047857' }}>
        {state?.error || state?.success || ''}
      </div>
    </form>
  );
}

export default function FixturesView({ league, fixtures, substitutes, rsvps, teeTimes, courseHoles, teams, teamCount, currentWeek, missingTeams = [] }) {
  const [activeTab, setActiveTab] = useState('fixtures'); // 'fixtures' | 'teesheet' | 'subs' | 'rsvp' | 'purse'
  const [selectedWeek, setSelectedWeek] = useState('all');

  const weeks = Array.from(new Set(fixtures.map(f => f.week_number))).sort((a, b) => a - b);
  const filteredFixtures = selectedWeek === 'all' ? fixtures : fixtures.filter(f => f.week_number === Number(selectedWeek));
  const displayHoleNumbers = courseHoles.length
    ? courseHoles.map(hole => hole.hole_number)
    : Array.from({ length: 18 }, (_, index) => index + 1);

  // Purse Calculator State
  const [entryFeePerPlayer, setEntryFeePerPlayer] = useState(50);
  const [totalPlayersCount, setTotalPlayersCount] = useState(teamCount || 0);
  const totalPurse = entryFeePerPlayer * totalPlayersCount;
  const firstPlacePurse = Math.round(totalPurse * 0.5);
  const secondPlacePurse = Math.round(totalPurse * 0.3);
  const thirdPlacePurse = Math.round(totalPurse * 0.2);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <CalendarIcon size={14} color="#059669" />
            <span style={{ color: '#047857', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase' }}>Pro Shop Tournament ERP</span>
          </div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>League Schedule & Tee Sheet</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>{league?.name} — Current: Week {currentWeek}</p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <a href={`/api/calendar/${league?.id}`} download style={{ textDecoration: 'none' }}>
            <button className="birvo-btn-secondary" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DownloadIcon size={16} /> Export iCal Calendar
            </button>
          </a>
          <Link href="/admin/cart-signs" style={{ textDecoration: 'none' }}>
            <button className="birvo-btn-primary" style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PrinterIcon size={16} color="#ffffff" /> Print Cart Plates
            </button>
          </Link>
        </div>
      </header>

      {/* ─── TABS ───────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {[
          { id: 'fixtures', label: `Season Schedule (${fixtures.length})`, icon: CalendarIcon },
          { id: 'teesheet', label: 'Shotgun Starting Grid', icon: FlagstickIcon },
          { id: 'purse', label: 'Purse & Prize Calculator', icon: DollarSignIcon },
          { id: 'subs', label: `Substitute Pool (${substitutes.length})`, icon: UsersIcon },
          { id: 'rsvp', label: `RSVPs & Attendance (${rsvps.length})`, icon: SparklesIcon },
          { id: 'ghost', label: `Missing Scorecards (${missingTeams.length})`, icon: SparklesIcon },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: isActive ? 'var(--color-primary-light)' : '#ffffff',
                color: isActive ? '#047857' : 'var(--color-text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s',
                boxShadow: 'var(--card-shadow)'
              }}
            >
              <Icon size={16} color={isActive ? '#059669' : 'currentColor'} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: FIXTURES ─────────────────────────────────────────────────────── */}
      {activeTab === 'fixtures' && (
        <div>
          {/* Generator & Filter Bar */}
          <div className="birvo-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: 'var(--color-text-main)', fontSize: '0.9rem', fontWeight: 600 }}>Filter Week:</span>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                style={{ padding: '8px 12px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', borderRadius: '6px', outline: 'none' }}
              >
                <option value="all">Full Season ({weeks.length} Weeks)</option>
                {weeks.map(w => (
                  <option key={w} value={w}>Week {w}</option>
                ))}
              </select>
            </div>

            <form action={generateFixturesAction} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Weeks:</span>
              {/* Defaults to the season the league was configured for. Generating a
                  schedule overwrites season_length_weeks, so a fixed default here
                  silently shortened the season the operator had already chosen. */}
              <input type="number" name="totalWeeks" defaultValue={league?.season_length_weeks || 10} min="2" max="52" style={{ width: '60px', padding: '8px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', borderRadius: '6px', textAlign: 'center', fontWeight: 700 }} />
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--color-text-main)', cursor: 'pointer', fontWeight: 600 }}>
                <input type="checkbox" name="doubleRound" style={{ accentColor: '#059669' }} />
                <span>Double Round-Robin</span>
              </label>
              <button type="submit" className="birvo-btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }}>
                ⚡ Auto-Generate Schedule
              </button>
            </form>
          </div>

          {/* Fixtures Table */}
          {filteredFixtures.length > 0 ? (
            <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto', background: '#ffffff' }}>
              <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '10px 8px' }}>Week</th>
                    <th style={{ padding: '10px 8px' }}>Tee Time</th>
                    <th style={{ padding: '10px 8px' }}>Team 1</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Matchup</th>
                    <th style={{ padding: '10px 8px' }}>Team 2</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFixtures.map(f => (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: f.week_number === currentWeek ? '#ecfdf5' : 'transparent' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 800, color: f.week_number === currentWeek ? '#047857' : 'var(--color-text-main)' }}>
                        Week {f.week_number} {f.week_number === currentWeek && '(Current)'}
                      </td>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)' }}>{f.scheduled_time || '09:00 AM'}</td>
                      <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--color-text-main)' }}>{f.team1_name}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'center', color: '#059669', fontStyle: 'italic', fontWeight: 800 }}>
                        {f.is_bye ? '—' : 'VS'}
                      </td>
                      <td style={{ padding: '12px 8px', color: f.is_bye ? '#d97706' : 'var(--color-text-main)', fontWeight: f.is_bye ? 600 : 700 }}>
                        {f.is_bye ? 'BYE (Open Week)' : f.team2_name}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '0.75rem',
                          background: f.is_bye ? '#fef3c7' : '#ecfdf5',
                          color: f.is_bye ? '#92400e' : '#047857',
                          border: `1px solid ${f.is_bye ? '#fde68a' : '#a7f3d0'}`,
                          fontWeight: 700
                        }}>
                          {f.is_bye ? 'BYE' : 'Scheduled'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="birvo-card" style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No fixtures created for this league yet. Click &quot;Auto-Generate Schedule&quot; above to create a round-robin season schedule.
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: SHOTGUN STARTING GRID MATRIX ─────────────────────────────────── */}
      {activeTab === 'teesheet' && (
        <div className="birvo-card" style={{ padding: '2rem', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '1rem' }}>
            <div>
              <h2 className="title-primary" style={{ fontSize: '1.35rem', margin: 0 }}>Shotgun Starting Hole Assignments</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                Week {currentWeek} 08:30 AM Morning Shotgun Grid
              </p>
            </div>
            <span style={{ background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', color: '#047857', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 800 }}>
              {courseHoles.length} HOLES CONFIGURED
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
            {displayHoleNumbers.map(holeNum => {
              const hole = courseHoles.find(item => item.hole_number === holeNum);
              const startingGroups = teeTimes.filter(item => item.starting_hole === holeNum);
              return (
                <div key={holeNum} style={{
                  background: startingGroups.length ? '#ecfdf5' : 'var(--color-bg-subtle)',
                  border: startingGroups.length ? '1px solid #a7f3d0' : '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '1rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ color: startingGroups.length ? '#047857' : 'var(--color-text-muted)', fontSize: '1.05rem' }}>Hole {holeNum}</strong>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{hole ? `Par ${hole.par}` : 'Not configured'}</span>
                  </div>
                  {startingGroups.length ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {startingGroups.map(group => (
                        <div key={group.id} style={{ borderTop: '1px solid #a7f3d0', paddingTop: '8px' }}>
                          <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 800 }}>Group {group.starting_group} · {group.start_time}</div>
                          <div style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', fontWeight: 700 }}>{group.team1_name || 'Open'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0' }}>vs</div>
                          <div style={{ fontSize: '0.88rem', color: 'var(--color-text-main)', fontWeight: 600 }}>{group.team2_name || 'Open / Bye'}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '8px 0' }}>
                      Open Tee Time Slot
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TAB 3: PURSE & PRIZE MONEY CALCULATOR ───────────────────────────────── */}
      {activeTab === 'purse' && (
        <div className="birvo-card" style={{ padding: '2.5rem', background: '#ffffff' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 className="title-primary" style={{ fontSize: '1.75rem', margin: 0 }}>Tournament Purse & Payout Distribution</h2>
            <p style={{ color: 'var(--color-text-muted)', maxWidth: '560px', margin: '0.5rem auto 0 auto' }}>
              Use this planning calculator to estimate the season prize pool and payouts for 1st, 2nd, and 3rd place finishes.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', alignItems: 'center' }}>
            {/* Input Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'var(--color-bg-subtle)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '6px', fontWeight: 700 }}>Entry Fee per Team ($ USD)</label>
                <input
                  type="number"
                  value={entryFeePerPlayer}
                  onChange={(e) => setEntryFeePerPlayer(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px', background: '#ffffff', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', fontSize: '1.1rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '6px', fontWeight: 700 }}>Total Teams Enrolled</label>
                <input
                  type="number"
                  value={totalPlayersCount}
                  onChange={(e) => setTotalPlayersCount(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px', background: '#ffffff', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', fontSize: '1.1rem', fontWeight: 700 }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--color-text-main)', fontWeight: 700 }}>Total Season Purse:</span>
                <strong style={{ fontSize: '1.6rem', color: '#059669' }}>${totalPurse.toLocaleString()}</strong>
              </div>
            </div>

            {/* Payout Distribution Output */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ background: '#fefce8', border: '1px solid #fef08a', padding: '1.25rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#92400e', fontSize: '1.05rem', display: 'block' }}>🥇 1st Place Champion (50%)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#a16207' }}>Season Gross/Net Winner</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#92400e' }}>${firstPlacePurse.toLocaleString()}</div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', padding: '1.25rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#334155', fontSize: '1.05rem', display: 'block' }}>🥈 2nd Place Runner-Up (30%)</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Championship Runner-Up</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--color-text-main)' }}>${secondPlacePurse.toLocaleString()}</div>
              </div>

              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '1.25rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ color: '#9a3412', fontSize: '1.05rem', display: 'block' }}>🥉 3rd Place Podium (20%)</strong>
                  <span style={{ fontSize: '0.8rem', color: '#c2410c' }}>Bronze Medalist</span>
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#9a3412' }}>${thirdPlacePurse.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: SUBSTITUTES ──────────────────────────────────────────────────── */}
      {activeTab === 'subs' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '2rem' }}>
          <div className="birvo-card" style={{ padding: '1.5rem', background: '#ffffff', overflowX: 'auto' }}>
            <h2 className="title-primary" style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Registered Substitutes (Sub Pool)</h2>
            {substitutes.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '10px 8px' }}>Player Name</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Handicap Index</th>
                    <th style={{ padding: '10px 8px' }}>Phone</th>
                    <th style={{ padding: '10px 8px' }}>Email</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {substitutes.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--color-text-main)' }}>{s.name}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 800, color: '#059669' }}>{s.handicap.toFixed(1)}</td>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)' }}>{s.phone || '-'}</td>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)' }}>{s.email || '-'}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 700 }}>
                          Available
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No players registered in the substitute pool yet.
              </div>
            )}
          </div>

          <div className="birvo-card" style={{ padding: '1.5rem', height: 'fit-content', background: '#ffffff' }}>
            <h3 style={{ color: 'var(--color-text-main)', marginBottom: '1rem', fontWeight: 800 }}>Add New Substitute</h3>
            <form action={addSubstituteAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Full Name</label>
                <input type="text" name="name" required placeholder="e.g. David Miller" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Handicap Index</label>
                <input type="number" step="0.1" name="handicap" defaultValue="12.0" required style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Phone</label>
                <input type="text" name="phone" placeholder="(555) 000-0000" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Email</label>
                <input type="email" name="email" placeholder="david@example.com" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <button type="submit" className="birvo-btn-primary" style={{ width: '100%', padding: '11px', marginTop: '0.5rem' }}>
                + Add to Sub Pool
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── TAB 5: RSVP ─────────────────────────────────────────────────────────── */}
      {activeTab === 'rsvp' && (
        <div className="birvo-card" style={{ padding: '1.5rem', background: '#ffffff', overflowX: 'auto' }}>
          <h2 className="title-primary" style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Week {currentWeek} Team RSVPs & Attendance Status</h2>
          {teams.length > 0 && <RSVPForm teams={teams} currentWeek={currentWeek} />}
          {rsvps.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '10px 8px' }}>Team</th>
                  <th style={{ padding: '10px 8px' }}>RSVP Status</th>
                  <th style={{ padding: '10px 8px' }}>Operations Notes</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Updated Date</th>
                </tr>
              </thead>
              <tbody>
                {rsvps.map(r => {
                  const presentation = RSVP_PRESENTATION[r.status] || RSVP_PRESENTATION.unknown;
                  return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--color-text-main)' }}>{r.team_name}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '0.75rem',
                        background: presentation.background,
                        color: presentation.color,
                        border: `1px solid ${presentation.border}`,
                        fontWeight: 700
                      }}>
                        {presentation.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)' }}>{r.note || '-'}</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {new Date(r.created_at).toLocaleDateString('en-US')}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No RSVPs have been recorded for this week. Use the status editor above to update team attendance.
            </div>
          )}
        </div>
      )}

      {activeTab === 'ghost' && (
        <GhostManager missingTeams={missingTeams} weekNumber={currentWeek} />
      )}

    </div>
  );
}
