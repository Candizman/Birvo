'use client';

import { useState } from 'react';
import { initializeCourseLayoutAction, saveCourseProfile, saveHoles, saveTeeBoxAction, deleteTeeBoxAction, generateTeeTimesAction } from './actions';
import {
  FlagstickIcon,
  WindIcon,
  SparklesIcon,
  CalendarIcon,
  UsersIcon,
  SettingsIcon,
  EditIcon,
  TrashIcon,
  TargetIcon
} from '../../../components/icons/GolfIcons';
import StaffAccessPanel from './StaffAccessPanel';

export default function CourseView({ courseDetails, weather, teeTimes, currentWeek }) {
  const [activeTab, setActiveTab] = useState('holes'); // 'holes', 'tees', 'teetimes', 'profile', 'staff'
  const [editingTee, setEditingTee] = useState(null);

  const { course, holes, teeBoxes, staff, stats } = courseDetails;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <FlagstickIcon size={14} color="#059669" />
            <span style={{ color: '#047857', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Facility Architecture
            </span>
          </div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>{course.name}</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>{course.city}{course.address ? `, ${course.address}` : ''}</p>
        </div>

        {/* Weather preview — clearly marked until a live provider is connected. */}
        {weather && (
          <div className="birvo-card" style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', background: '#ffffff' }}>
            <div>
              <div style={{ color: '#9a651b', fontSize: '0.67rem', fontWeight: 850, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Sample weather data</div>
              <div style={{ fontWeight: 900, fontSize: '1.15rem', color: 'var(--color-text-main)' }}>{weather.tempF}°F</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <WindIcon size={12} color="#0284c7" /> Wind {weather.windMph} mph {weather.windDirection}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 800 }}>{weather.golfIndex}</div>
            </div>
          </div>
        )}
      </header>

      {/* ─── TABS ───────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '2rem', overflowX: 'auto' }}>
        {[
          { id: 'holes', label: `18-Hole Layout (${stats.totalPar} Par)`, icon: FlagstickIcon },
          { id: 'tees', label: `Tee Boxes & USGA Ratings (${teeBoxes.length})`, icon: TargetIcon },
          { id: 'teetimes', label: `Shotgun Starting Times`, icon: CalendarIcon },
          { id: 'profile', label: `Club Profile & Local Rules`, icon: SettingsIcon },
          { id: 'staff', label: `Staff & RBAC Access (${staff.length})`, icon: UsersIcon }
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
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── TAB 1: 18 HOLES & PIN POSITIONS ─────────────────────────────────────── */}
      {activeTab === 'holes' && (holes.length === 0 ? (
        <form action={initializeCourseLayoutAction} className="birvo-card" style={{ padding: '2.5rem', textAlign: 'center', background: '#ffffff' }}>
          <h2 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '1.5rem' }}>The course layout has not been created yet</h2>
          <p style={{ maxWidth: '580px', margin: '12px auto 24px', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
            Birvo can create 18 editable holes and four starter tee sets. Nothing is written until you select the button below.
          </p>
          <button type="submit" className="birvo-btn-primary">Create default layout</button>
        </form>
      ) : (
        <form action={saveHoles}>
          <div className="birvo-card" style={{ padding: '1.5rem', marginBottom: '2rem', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 className="title-primary" style={{ fontSize: '1.3rem', margin: 0 }}>18-Hole Par & Handicap Stroke Index Layout</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Front 9: {stats.front9Par} Par | Back 9: {stats.back9Par} Par | 18-Hole Total: <strong style={{ color: 'var(--color-text-main)' }}>{stats.totalPar} Par</strong>
                </p>
              </div>
              <button type="submit" className="birvo-btn-primary" style={{ padding: '9px 20px' }}>
                Save Hole Layout
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'center' }} className="tabular-nums">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left' }}>Hole Number</th>
                    <th style={{ padding: '10px 8px' }}>Par (3-6)</th>
                    <th style={{ padding: '10px 8px' }}>Stroke Index (1-18)</th>
                    <th style={{ padding: '10px 8px' }}>Pin Position</th>
                    <th style={{ padding: '10px 8px' }}>Maintenance Status</th>
                  </tr>
                </thead>
                <tbody>
                  {holes.map(h => (
                    <tr key={h.hole_number} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: h.is_under_maintenance ? '#fef2f2' : 'transparent' }}>
                      <td style={{ padding: '12px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-main)' }}>
                        Hole #{h.hole_number} {h.hole_number === 9 && '(Front 9 Out)'} {h.hole_number === 18 && '(Back 9 In)'}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <input
                          type="number"
                          name={`par_${h.hole_number}`}
                          defaultValue={h.par}
                          min="3"
                          max="6"
                          required
                          style={{ width: '60px', padding: '6px', textAlign: 'center', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <input
                          type="number"
                          name={`stroke_index_${h.hole_number}`}
                          defaultValue={h.stroke_index}
                          min="1"
                          max="18"
                          required
                          style={{ width: '60px', padding: '6px', textAlign: 'center', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', fontWeight: 700 }}
                        />
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <select
                          name={`pin_${h.hole_number}`}
                          defaultValue={h.pin_position || 'center'}
                          style={{ padding: '6px 12px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', borderRadius: '6px', fontWeight: 600 }}
                        >
                          <option value="front">Front Location</option>
                          <option value="center">Center Location</option>
                          <option value="back">Back Location</option>
                        </select>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: h.is_under_maintenance ? '#dc2626' : 'var(--color-text-muted)', fontWeight: 600 }}>
                          <input type="checkbox" name={`maintenance_${h.hole_number}`} defaultChecked={h.is_under_maintenance} style={{ accentColor: '#dc2626' }} />
                          <span>{h.is_under_maintenance ? 'Aerated / Closed' : 'Playable'}</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </form>
      ))}

      {/* ─── TAB 2: TEE BOXES & USGA RATINGS ─────────────────────────────────────── */}
      {activeTab === 'tees' && (
        <div>
          <div className="birvo-card" style={{ padding: '1.5rem', marginBottom: '2rem', background: '#ffffff' }}>
            <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1.5rem' }}>Tee Box Levels & USGA Course Ratings</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '10px 8px' }}>Tee Name</th>
                  <th style={{ padding: '10px 8px' }}>Division</th>
                  <th style={{ padding: '10px 8px' }}>Course Rating</th>
                  <th style={{ padding: '10px 8px' }}>Slope Rating</th>
                  <th style={{ padding: '10px 8px' }}>Total Distance</th>
                  <th style={{ padding: '10px 8px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teeBoxes.map(tee => (
                  <tr key={tee.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '12px 8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                      <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', background: tee.color_hex, border: '1px solid #94a3b8' }} />
                      {tee.name}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)' }}>{tee.gender === 'men' ? 'Men' : tee.gender === 'women' ? 'Women' : 'Open / All'}</td>
                    <td style={{ padding: '12px 8px', color: '#0284c7', fontWeight: 800 }}>{tee.course_rating.toFixed(1)}</td>
                    <td style={{ padding: '12px 8px', color: '#d97706', fontWeight: 800 }}>{tee.slope_rating}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--color-text-main)' }}>{Number(tee.total_yards).toLocaleString('en-US')} yds</td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => setEditingTee(tee)}
                        className="birvo-btn-secondary"
                        style={{ padding: '6px 12px', marginRight: '6px', fontSize: '0.82rem' }}
                      >
                        Edit
                      </button>
                      <form action={deleteTeeBoxAction} style={{ display: 'inline' }}>
                        <input type="hidden" name="teeId" value={tee.id} />
                        <button type="submit" style={{ padding: '6px 12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem' }}>
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add / Edit Tee Form */}
          <div className="birvo-card" style={{ padding: '1.5rem', maxWidth: '600px', background: '#ffffff' }}>
            <h3 style={{ color: 'var(--color-text-main)', marginBottom: '1rem', fontWeight: 800 }}>{editingTee ? 'Edit Tee Box' : 'Add New Tee Box'}</h3>
            <form action={saveTeeBoxAction} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {editingTee && <input type="hidden" name="id" value={editingTee.id} />}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Tee Name</label>
                <input type="text" name="name" defaultValue={editingTee?.name || ''} required placeholder="e.g. Blue (Championship)" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Color Hex Code</label>
                <input type="text" name="color_hex" defaultValue={editingTee?.color_hex || '#3b82f6'} required style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Division / Category</label>
                <select name="gender" defaultValue={editingTee?.gender || 'all'} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', borderRadius: '6px' }}>
                  <option value="all">Open / All</option>
                  <option value="men">Men</option>
                  <option value="women">Women</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>USGA Course Rating</label>
                <input type="number" step="0.1" name="course_rating" defaultValue={editingTee?.course_rating || 72.0} required style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Slope Rating (55 - 155)</label>
                <input type="number" name="slope_rating" defaultValue={editingTee?.slope_rating || 113} min="55" max="155" required style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Total Yards</label>
                <input type="number" name="total_yards" defaultValue={editingTee?.total_yards || 6400} required style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="birvo-btn-primary" style={{ padding: '10px 20px' }}>
                  {editingTee ? 'Update Tee Box' : 'Save Tee Box'}
                </button>
                {editingTee && (
                  <button type="button" onClick={() => setEditingTee(null)} className="birvo-btn-secondary" style={{ padding: '10px 16px' }}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── TAB 3: TEE TIMES & SHOTGUN ─────────────────────────────────────────── */}
      {activeTab === 'teetimes' && (
        <div>
          <div className="birvo-card" style={{ padding: '1.5rem', marginBottom: '2rem', background: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 className="title-primary" style={{ fontSize: '1.3rem', margin: 0 }}>Week {currentWeek} Starting Times & Shotgun Pairings</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Automated hole assignments and tee time schedule for all league teams.
                </p>
              </div>

              <form action={generateTeeTimesAction} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="hidden" name="weekNumber" value={currentWeek} />
                <input type="time" name="startTime" defaultValue="09:00" style={{ padding: '8px 12px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: 'var(--color-text-main)', borderRadius: '6px' }} />
                <button type="submit" className="birvo-btn-primary" style={{ padding: '8px 16px', fontSize: '0.88rem' }}>
                  ⚡ Auto-Schedule Shotgun
                </button>
              </form>
            </div>

            {teeTimes.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <th style={{ padding: '10px 8px' }}>Start Time</th>
                    <th style={{ padding: '10px 8px' }}>Starting Hole</th>
                    <th style={{ padding: '10px 8px' }}>Team 1</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center' }}>Matchup</th>
                    <th style={{ padding: '10px 8px' }}>Team 2</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {teeTimes.map(tt => (
                    <tr key={tt.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      <td style={{ padding: '12px 8px', fontWeight: 800, color: '#0284c7' }}>{tt.start_time}</td>
                      <td style={{ padding: '12px 8px', fontWeight: 800, color: '#059669' }}>Hole #{tt.starting_hole}{tt.starting_group}</td>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-main)', fontWeight: 700 }}>{tt.team1_name || 'Open / TBD'}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'center', color: '#059669', fontStyle: 'italic', fontWeight: 800 }}>VS</td>
                      <td style={{ padding: '12px 8px', color: 'var(--color-text-main)', fontWeight: 700 }}>{tt.team2_name || 'Open / TBD'}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 700 }}>
                          {tt.status === 'scheduled' ? 'Scheduled' : tt.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                No tee time schedule generated for this week yet. Click the button above to auto-generate shotgun assignments.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 4: PROFILE & LOCAL RULES ───────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <form action={saveCourseProfile} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="birvo-card" style={{ padding: '1.5rem', background: '#ffffff' }}>
            <h3 className="title-primary" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Course & Facility Contact Information</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Course / Club Name</label>
                <input type="text" name="name" defaultValue={course.name} required style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>City</label>
                <input type="text" name="city" defaultValue={course.city || ''} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Address</label>
                <input type="text" name="address" defaultValue={course.address || ''} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Contact Email</label>
                <input type="email" name="contact_email" defaultValue={course.contact_email || ''} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Contact Phone</label>
                <input type="text" name="contact_phone" defaultValue={course.contact_phone || ''} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Theme Accent Color (Hex)</label>
                <input type="text" name="primary_color" defaultValue={course.primary_color || '#059669'} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
              </div>
            </div>
          </div>

          <div className="birvo-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
            <h3 className="title-primary" style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>Local Course Rules</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Rules displayed on player mobile digital scorecards and clubhouse notices:
            </p>
            <textarea
              name="local_rules"
              defaultValue={course.local_rules || ''}
              rows={10}
              style={{ width: '100%', flex: 1, padding: '12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', lineHeight: '1.6', outline: 'none' }}
            />
            <button type="submit" className="birvo-btn-primary" style={{ marginTop: '1rem', padding: '12px' }}>
              Save Profile & Rules
            </button>
          </div>
        </form>
      )}

      {/* ─── TAB 5: STAFF & RBAC ─────────────────────────────────────────────────── */}
      {activeTab === 'staff' && <StaffAccessPanel staff={staff} />}

    </div>
  );
}
