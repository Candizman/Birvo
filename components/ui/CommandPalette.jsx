'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  SearchIcon,
  FlagstickIcon,
  TrophyIcon,
  TvIcon,
  UserIcon,
  SettingsIcon,
  CalendarIcon,
  ReceiptIcon,
  PrinterIcon,
  CloseIcon,
  SparklesIcon
} from '../icons/GolfIcons';

const MANAGEMENT_ROLES = new Set(['superadmin', 'course_owner', 'course_admin', 'admin']);

export default function CommandPalette({ leagueId = null, standingsToken = null, tvToken = null, role = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();

  const canManageCourse = MANAGEMENT_ROLES.has(role);
  const navigationItems = [
    { title: 'Admin Dashboard', path: '/admin', icon: <SettingsIcon size={18} color="#d4af37" />, category: 'Administration' },
    { title: 'Rapid Score Entry', path: '/admin/rapid-entry', icon: <SparklesIcon size={18} color="#10b981" />, category: 'Scoring' },
    canManageCourse ? { title: 'Course & Facilities (18 Holes & Tees)', path: '/admin/course', icon: <FlagstickIcon size={18} color="#38bdf8" />, category: 'Course' } : null,
    { title: 'WHS Handicap Index Roster', path: '/admin/handicaps', icon: <UserIcon size={18} color="#d4af37" />, category: 'Handicaps' },
    { title: 'Schedule & Round-Robin Fixtures', path: '/admin/fixtures', icon: <CalendarIcon size={18} color="#a855f7" />, category: 'Tournament' },
    canManageCourse ? { title: 'Tournament Formats & Playoff Brackets', path: '/admin/leagues', icon: <TrophyIcon size={18} color="#f59e0b" />, category: 'Tournament' } : null,
    { title: 'Analytics & 18-Hole Difficulty Reports', path: '/admin/reports', icon: <SparklesIcon size={18} color="#ec4899" />, category: 'Reports' },
    leagueId && tvToken ? { title: 'Clubhouse TV Standings', path: `/tv/${leagueId}?access=${tvToken}`, icon: <TvIcon size={18} color="#10b981" />, category: 'Display' } : null,
    { title: 'Printable Golf Cart Signs (PDF)', path: '/admin/cart-signs', icon: <PrinterIcon size={18} color="#94a3b8" />, category: 'Pro Shop' },
    canManageCourse ? { title: 'SaaS Billing, Plans & Promo Codes', path: '/admin/billing', icon: <ReceiptIcon size={18} color="#38bdf8" />, category: 'Billing' } : null,
    { title: 'Player Mobile Scorecard', path: '/player', icon: <UserIcon size={18} color="#10b981" />, category: 'Player' },
    leagueId && standingsToken ? { title: 'Public Live Standings', path: `/standings?leagueId=${leagueId}&access=${standingsToken}`, icon: <TrophyIcon size={18} color="#d4af37" />, category: 'Public' } : null,
  ].filter(Boolean);

  // Global keyboard listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const filteredItems = navigationItems.filter(item =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingTop: '12vh',
      zIndex: 9999
    }}>
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '580px',
          background: '#0f172a',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(212, 175, 55, 0.15)',
          overflow: 'hidden'
        }}
      >
        {/* Search Input Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <SearchIcon size={20} color="#d4af37" />
          <input
            type="text"
            placeholder="Type a command, page, or tournament module..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '1.05rem',
              outline: 'none',
              fontWeight: 500
            }}
          />
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        {/* Results List */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '8px' }}>
          {filteredItems.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              No matching modules found for &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setIsOpen(false);
                  router.push(item.path);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  marginBottom: '2px'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {item.icon}
                  </div>
                  <div>
                    <div style={{ color: 'white', fontWeight: 600, fontSize: '0.95rem' }}>{item.title}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: '2px' }}>{item.category}</div>
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                  ↵ Jump
                </span>
              </div>
            ))
          )}
        </div>

        {/* Footer Hint */}
        <div style={{
          padding: '10px 20px',
          background: 'rgba(0, 0, 0, 0.3)',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: '#64748b'
        }}>
          <div>
            Press <kbd style={{ padding: '2px 5px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', color: '#e2e8f0' }}>Esc</kbd> to exit
          </div>
          <div>
            <span style={{ color: '#d4af37', fontWeight: 'bold' }}>Birvo</span> Quick Command Bar
          </div>
        </div>
      </div>
    </div>
  );
}
