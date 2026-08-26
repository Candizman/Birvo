import db from '../../lib/database';
import {
  ShieldCheckIcon,
  FlagstickIcon,
} from '../../components/icons/GolfIcons';

export default async function SuperAdminDashboard() {
  // Fetch all courses
  const courses = db.prepare('SELECT id, name, city FROM courses').all();

  // Statistics for each course
  const coursesWithStats = courses.map(course => {
    const leaguesCount = db.prepare('SELECT COUNT(*) as count FROM leagues WHERE course_id = ?').get(course.id).count;
    const teamsCount = db.prepare(`
      SELECT COUNT(*) as count FROM teams t
      JOIN leagues l ON t.league_id = l.id
      WHERE l.course_id = ?
    `).get(course.id).count;
    return { ...course, leaguesCount, teamsCount };
  });

  const totalCourses = courses.length;
  const totalLeagues = coursesWithStats.reduce((acc, c) => acc + c.leaguesCount, 0);
  const totalTeams = coursesWithStats.reduce((acc, c) => acc + c.teamsCount, 0);

  return (
    <div className="container" style={{ maxWidth: '100%', padding: '1rem 0' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <ShieldCheckIcon size={14} color="#d4af37" />
            <span style={{ color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Multi-Tenant Cloud Fleet
            </span>
          </div>
          <h1 className="title-gold" style={{ fontSize: '2.4rem', margin: 0, fontWeight: 900 }}>
            Super Admin Mission Control
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Monitor facility workspaces, league volume, and platform usage from one place.
          </p>
        </div>
      </header>

      {/* ─── PLATFORM KPI CARDS ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid rgba(212, 175, 55, 0.3)' }}>
          <div style={{ color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.5rem' }}>
            REGISTERED FACILITIES
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>
            {totalCourses} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>facilities</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', fontWeight: 700 }}>Course workspaces</div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.5rem' }}>
            TOTAL TEAMS
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>
            {totalTeams} Teams
          </div>
          <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginTop: '4px' }}>Across all facilities and leagues</div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.5rem' }}>
            LEAGUE SEASONS
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981' }}>
            {totalLeagues} Leagues
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>Total leagues on the platform</div>
        </div>
      </div>

      {/* ─── TENANTS TABLE ──────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '2rem', overflowX: 'auto' }}>
        <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FlagstickIcon size={18} color="#d4af37" /> Registered Country Clubs & Facilities
        </h2>

        <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px' }}>Facility / Club Name</th>
              <th style={{ padding: '12px' }}>Location</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Active Leagues</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Total Teams</th>
            </tr>
          </thead>
          <tbody>
            {coursesWithStats.map(course => (
              <tr key={course.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '14px 12px', fontWeight: 700, color: 'white' }}>
                  {course.name}
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>ID: #{course.id}</div>
                </td>
                <td style={{ padding: '14px 12px', color: '#cbd5e1' }}>{course.city || 'Location not provided'}</td>
                <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 700, color: '#38bdf8' }}>{course.leaguesCount}</td>
                <td style={{ padding: '14px 12px', textAlign: 'center', fontWeight: 700, color: 'white' }}>{course.teamsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
