'use client';

import { useActionState, useState } from 'react';
import { saveProfileAction, addClubAction, deleteClubAction, addRoundNoteAction } from './actions';
import Link from 'next/link';
import {
  TrophyIcon,
  SparklesIcon,
  FlagstickIcon,
  TargetIcon,
  UserIcon,
  CalendarIcon,
  GolfBallIcon,
  CloseIcon
} from '../../../components/icons/GolfIcons';

export default function ProfileView({ profileData }) {
  const [activeTab, setActiveTab] = useState('bag'); // 'bag', 'badges', 'profile', 'history'
  const { team, profile, badges, clubs, roundNotes, scores } = profileData;
  const [profileResult, profileAction, profilePending] = useActionState(
    async (_previousState, formData) => saveProfileAction(formData), null
  );
  const [clubResult, clubAction, clubPending] = useActionState(
    async (_previousState, formData) => addClubAction(formData), null
  );
  const [deleteResult, deleteAction, deletePending] = useActionState(
    async (_previousState, formData) => deleteClubAction(formData), null
  );
  const [noteResult, noteAction, notePending] = useActionState(
    async (_previousState, formData) => addRoundNoteAction(formData), null
  );

  const sortedClubs = [...clubs].sort((a, b) => b.avg_distance_yards - a.avg_distance_yards);
  const maxDistance = sortedClubs.length > 0 ? Math.max(...sortedClubs.map(c => c.avg_distance_yards), 280) : 280;

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem 1rem 5rem' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <Link href="/player" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          ← Back to Member Portal
        </Link>
        <span style={{ fontSize: '0.82rem', color: '#047857', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '12px', fontWeight: 800 }}>
          Player portal
        </span>
      </div>

      {/* ─── PLAYER BADGE HERO ─────────────────────────────────────────────────── */}
      <div className="birvo-card" style={{ padding: '1.75rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', background: '#ffffff' }}>
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          background: 'var(--color-primary)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.8rem',
          fontWeight: 900,
          boxShadow: '0 4px 12px rgba(5, 150, 105, 0.3)'
        }}>
          {team.name.charAt(0)}
        </div>
        <div>
          <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.02em' }}>{team.name}</h1>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px', fontWeight: 600 }}>
            Current Handicap: <strong style={{ color: 'var(--color-text-main)' }}>{Number(team.current_handicap).toFixed(1)}</strong> • Season Goal: <strong style={{ color: '#059669' }}>{Number(profile.handicap_goal ?? 5).toFixed(1)}</strong>
          </div>
        </div>
      </div>

      {/* ─── TABS ───────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {[
          { id: 'bag', label: `Bag Yardages (${clubs.length})`, icon: TargetIcon },
          { id: 'badges', label: `Trophy Cabinet (${badges.length})`, icon: TrophyIcon },
          { id: 'history', label: 'Rounds & Notes', icon: CalendarIcon },
          { id: 'profile', label: 'Preferences', icon: UserIcon }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: isActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: isActive ? 'var(--color-primary-light)' : '#ffffff',
                color: isActive ? '#047857' : 'var(--color-text-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
                boxShadow: isActive ? 'var(--card-shadow)' : 'none'
              }}
            >
              <Icon size={15} color={isActive ? '#059669' : 'currentColor'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: GOLF BAG & YARDAGE GAPPING ───────────────────────────────────── */}
      {activeTab === 'bag' && (
        <div>
          <div className="birvo-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', background: '#ffffff' }}>
            <h2 className="title-primary" style={{ fontSize: '1.2rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TargetIcon size={18} color="#059669" /> Visual Bag Yardage Gapping
            </h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Distance coverage and gaps used by the live GPS Caddie to recommend clubs on the course.
            </p>

            {sortedClubs.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="tabular-nums">
                {sortedClubs.map(c => {
                  const pct = Math.min(100, (c.avg_distance_yards / maxDistance) * 100);
                  return (
                    <div key={c.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '4px' }}>
                        <strong style={{ color: 'var(--color-text-main)' }}>{c.club_name} {c.brand && <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({c.brand})</span>}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: '#0284c7', fontWeight: 800 }}>{c.avg_distance_yards} yds</span>
                          <form action={deleteAction}>
                            <input type="hidden" name="clubId" value={c.id} />
                            <button type="submit" disabled={deletePending} aria-label={`Remove ${c.club_name}`} style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: deletePending ? 'wait' : 'pointer', fontSize: '0.85rem', padding: '0 4px', fontWeight: 800 }}>✕</button>
                          </form>
                        </div>
                      </div>
                      <div style={{ width: '100%', height: '10px', background: 'var(--color-bg-subtle)', borderRadius: '5px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                        <div style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #059669, #0284c7)',
                          borderRadius: '5px'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-muted)' }}>
                No clubs configured in your bag yet. Add your clubs below.
              </div>
            )}
          </div>

          {/* Add Club Form */}
          <form action={clubAction} className="birvo-card" style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', background: '#ffffff' }}>
            {(clubResult?.error || deleteResult?.error) && (
              <div role="alert" style={{ gridColumn: 'span 2', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px' }}>
                {clubResult?.error || deleteResult?.error}
              </div>
            )}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Club Name</label>
              <input type="text" name="clubName" required placeholder="e.g. 7 Iron, 3 Wood, 56° Wedge" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Brand / Model</label>
              <input type="text" name="brand" placeholder="Titleist T200" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Carry Distance (Yards)</label>
              <input type="number" name="avgDistanceYards" min="0" max="450" step="1" defaultValue="165" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', fontWeight: 700 }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <button type="submit" disabled={clubPending} className="birvo-btn-primary" style={{ width: '100%', padding: '11px', marginTop: '0.5rem' }}>
                {clubPending ? 'Adding Club...' : '+ Add Club to Bag'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── TAB 2: TROPHY CABINET ──────────────────────────────────────────────── */}
      {activeTab === 'badges' && (
        <div className="birvo-card" style={{ padding: '1.75rem', background: '#ffffff' }}>
          <h2 className="title-primary" style={{ fontSize: '1.2rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrophyIcon size={20} color="#059669" /> Metallic Achievement Cabinet
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem' }}>
            {badges.length > 0 ? badges.map((badge) => (
              <div key={badge.id} style={{ background: '#f4faf6', border: '1px solid #cce4d3', borderRadius: '12px', padding: '1.25rem 0.75rem', textAlign: 'center' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#0f6a50', color: '#ffffff', display: 'grid', placeItems: 'center', margin: '0 auto 8px', fontSize: '1.35rem' }}>
                  {badge.badge_icon || '⛳'}
                </div>
                <div style={{ fontWeight: 800, color: 'var(--color-text-main)', fontSize: '0.85rem' }}>{badge.badge_title}</div>
                <div style={{ fontSize: '0.7rem', color: '#4d6d62', marginTop: '3px', fontWeight: 700 }}>
                  {new Date(badge.awarded_at).toLocaleDateString('en-US')}
                </div>
              </div>
            )) : (
              <div style={{ gridColumn: '1 / -1', padding: '2rem', border: '1px dashed var(--color-border)', borderRadius: '12px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                No badges earned yet. Badges will appear here as league milestones are completed.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 3: ROUNDS & DIARY ──────────────────────────────────────────────── */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="birvo-card" style={{ padding: '1.5rem', background: '#ffffff' }}>
            <h2 className="title-primary" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Round Scoring History</h2>
            {scores.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '8px' }}>Round</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Gross</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Net Score</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: '10px 8px', color: 'var(--color-text-main)', fontWeight: 700 }}>Week {s.week_number}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{s.gross_score}</td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: '#059669', fontWeight: 800 }}>{Number(s.net_score).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-muted)' }}>
                No completed rounds logged yet.
              </div>
            )}
          </div>

          {/* Round Notes / Diary */}
          <div className="birvo-card" style={{ padding: '1.5rem', background: '#ffffff' }}>
            <h2 className="title-primary" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Golf Diary & Caddie Notes</h2>
            <form action={noteAction} style={{ marginBottom: '1.5rem' }}>
              {noteResult?.error && (
                <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>{noteResult.error}</div>
              )}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input type="number" name="weekNumber" placeholder="Wk" defaultValue="1" style={{ width: '60px', padding: '8px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', borderRadius: '6px', textAlign: 'center', fontWeight: 700 }} />
                <input type="text" name="notes" required placeholder="Putting feel, wind notes, club selections..." style={{ flex: 1, padding: '8px 12px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', borderRadius: '6px' }} />
                <button type="submit" disabled={notePending} className="birvo-btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  {notePending ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </form>

            {roundNotes.map(n => (
              <div key={n.id} style={{ padding: '12px', background: 'var(--color-bg-subtle)', borderRadius: '8px', border: '1px solid var(--color-border-subtle)', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 800 }}>Week {n.week_number} Note</div>
                <div style={{ color: 'var(--color-text-main)', fontSize: '0.9rem', marginTop: '2px' }}>{n.notes}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TAB 4: PREFERENCES ─────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <form action={profileAction} className="birvo-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: '#ffffff' }}>
          {profileResult?.error && (
            <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px' }}>{profileResult.error}</div>
          )}
          {profileResult?.success && (
            <div role="status" style={{ color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 12px' }}>Preferences saved.</div>
          )}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Player Bio</label>
            <textarea name="bio" defaultValue={profile.bio || ''} rows={3} style={{ width: '100%', padding: '10px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', outline: 'none' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Favorite Club</label>
              <input type="text" name="favoriteClub" defaultValue={profile.favorite_club || 'Driver'} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Season Handicap Goal</label>
              <input type="number" step="0.1" name="handicapGoal" defaultValue={profile.handicap_goal || 5.0} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Display Theme</label>
            <select name="themePreference" defaultValue={profile.theme_preference || 'system'} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }}>
              <option value="system">Use device setting</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <button type="submit" disabled={profilePending} className="birvo-btn-primary" style={{ width: '100%', padding: '11px', marginTop: '0.5rem' }}>
            {profilePending ? 'Saving...' : 'Save Preferences'}
          </button>
        </form>
      )}

    </div>
  );
}
