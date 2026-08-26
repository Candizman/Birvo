'use client';

import { useState } from 'react';
import { adjustHandicapManually } from './actions';
import {
  TargetIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
  CalendarIcon,
  CloseIcon,
  EyeIcon,
  ChevronRightIcon
} from '../../../components/icons/GolfIcons';

export default function HandicapView({ teams, auditLogs }) {
  const [activeTab, setActiveTab] = useState('teams'); // 'teams' | 'logs'
  const [selectedTeam, setSelectedTeam] = useState(null);

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <ShieldCheckIcon size={14} color="#059669" />
            <span style={{ color: '#047857', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Simple League Handicap
            </span>
          </div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>
            Handicap Index Roster & Audit
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>
            Official score averaging (max(0, (avg - 36) * 0.8)) and committee audit logs.
          </p>
        </div>
      </header>

      {/* ─── TABS ───────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab('teams')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: activeTab === 'teams' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
            background: activeTab === 'teams' ? 'var(--color-primary-light)' : '#ffffff',
            color: activeTab === 'teams' ? '#047857' : 'var(--color-text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <UsersIcon size={16} color={activeTab === 'teams' ? '#059669' : 'currentColor'} />
          Team Roster ({teams.length})
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px',
            border: activeTab === 'logs' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
            background: activeTab === 'logs' ? 'var(--color-primary-light)' : '#ffffff',
            color: activeTab === 'logs' ? '#047857' : 'var(--color-text-muted)',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <CalendarIcon size={16} color={activeTab === 'logs' ? '#059669' : 'currentColor'} />
          Committee Audit Trail ({auditLogs.length})
        </button>
      </div>

      {/* ─── TAB 1: TEAM ROSTER ─────────────────────────────────────────────────── */}
      {activeTab === 'teams' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedTeam ? '1fr 380px' : '1fr', gap: '2rem' }}>
          <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '12px 10px' }}>Team / Player</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>Handicap Index</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center' }}>Low HI (365d)</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((t, idx) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border-subtle)', background: idx % 2 === 0 ? 'var(--color-bg-subtle)' : 'transparent' }}>
                    <td style={{ padding: '14px 10px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                      {t.name}
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>GHIN: {t.ghin_number || '1048291'}</div>
                    </td>
                    <td style={{ padding: '14px 10px', textAlign: 'center', fontWeight: 900, color: '#059669', fontSize: '1.15rem' }}>
                      {t.current_handicap.toFixed(1)}
                    </td>
                    <td style={{ padding: '14px 10px', textAlign: 'center', color: '#0284c7', fontWeight: 700 }}>
                      {t.low_handicap_365 !== null ? t.low_handicap_365.toFixed(1) : (t.current_handicap - 0.8).toFixed(1)}
                    </td>
                    <td style={{ padding: '14px 10px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedTeam(t)}
                        className="birvo-btn-secondary"
                        style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                      >
                        Revise
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Committee Revision Form Side-Panel */}
          {selectedTeam && (
            <div className="birvo-card" style={{ padding: '1.5rem', height: 'fit-content', background: '#ffffff', boxShadow: 'var(--card-shadow-lg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ color: 'var(--color-text-main)', margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Committee Handicap Revision</h3>
                <button onClick={() => setSelectedTeam(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                  <CloseIcon size={16} />
                </button>
              </div>

              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                Team: <strong style={{ color: 'var(--color-text-main)' }}>{selectedTeam.name}</strong> (Current HI: {selectedTeam.current_handicap})
              </p>

              <form action={adjustHandicapManually} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <input type="hidden" name="teamId" value={selectedTeam.id} />

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>New Handicap Index (0.0 - 54.0)</label>
                  <input type="number" step="0.1" name="newHandicap" defaultValue={selectedTeam.current_handicap} required min="0" max="54" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', fontSize: '1.1rem', fontWeight: 700 }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>GHIN Number</label>
                  <input type="text" name="ghin" defaultValue={selectedTeam.ghin_number || ''} placeholder="e.g. 1048293" style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px' }} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-main)', marginBottom: '4px', fontWeight: 700 }}>Official Reason for Revision</label>
                  <textarea name="reason" required placeholder="Committee decision, tournament exceptional score, medical adjustment..." rows={3} style={{ width: '100%', padding: '9px 12px', background: 'var(--color-bg-subtle)', border: '1px solid #cbd5e1', color: 'var(--color-text-main)', borderRadius: '6px', outline: 'none' }} />
                </div>

                <button type="submit" className="birvo-btn-primary" style={{ width: '100%', padding: '11px', marginTop: '0.5rem' }}>
                  Post Official Revision
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 2: AUDIT LOGS ─────────────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div className="birvo-card" style={{ padding: '1.5rem', overflowX: 'auto' }}>
          <h2 className="title-primary" style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Official Handicap Audit Trail</h2>
          {auditLogs.length > 0 ? (
            <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '10px 8px' }}>Date / Time</th>
                  <th style={{ padding: '10px 8px' }}>Team</th>
                  <th style={{ padding: '10px 8px' }}>Old HI</th>
                  <th style={{ padding: '10px 8px' }}>New HI</th>
                  <th style={{ padding: '10px 8px' }}>Change Type</th>
                  <th style={{ padding: '10px 8px' }}>Reason</th>
                  <th style={{ padding: '10px 8px' }}>Modified By</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                      {new Date(log.created_at).toLocaleString('en-US')}
                    </td>
                    <td style={{ padding: '12px 8px', fontWeight: 700, color: 'var(--color-text-main)' }}>{log.team_name}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)' }}>{log.old_handicap.toFixed(1)}</td>
                    <td style={{ padding: '12px 8px', fontWeight: 800, color: '#059669' }}>{log.new_handicap.toFixed(1)}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: log.change_type === 'referee_manual' ? '#fef3c7' : '#f0f9ff',
                        color: log.change_type === 'referee_manual' ? '#92400e' : '#0369a1',
                        border: `1px solid ${log.change_type === 'referee_manual' ? '#fde68a' : '#bae6fd'}`
                      }}>
                        {log.change_type === 'referee_manual' ? 'Committee Revision' : 'Auto Round Post'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{log.reason || '-'}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{log.modified_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              No handicap audit records recorded yet.
            </div>
          )}
        </div>
      )}

    </div>
  );
}
