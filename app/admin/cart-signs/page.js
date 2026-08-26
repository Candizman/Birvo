import db from '../../../lib/database';
import PrintButton from './PrintButton';
import { getAdminContext } from '../../../lib/auth';
import { FlagstickIcon, TrophyIcon, GolfCartIcon } from '../../../components/icons/GolfIcons';
import Link from 'next/link';
import EmptyState from '../../../components/ui/EmptyState';

export default async function CartSignsPage({ searchParams }) {
  const context = await getAdminContext();
  if (!context) {
    return <EmptyState title="Admin session required" description="Sign in to access cart sign printing." primaryHref="/login" primaryLabel="Sign in" />;
  }

  if (!context.courseId || !context.leagueId) {
    return <EmptyState title="An active league is required" description="Complete course setup and create an active league before generating cart signs." primaryHref="/admin/leagues" primaryLabel="Open leagues" />;
  }

  const p = await searchParams;
  const leagueId = context.leagueId;
  const currentWeek = context.currentWeek || 1;
  const selectedWeek = p?.week ? parseInt(p.week) : currentWeek;

  const { createAdminClient } = require('../../../lib/supabase/admin');
  const adminClient = createAdminClient();
  const { getCartSignsDataAsync } = require('../../../lib/services/cartSignsService');

  const { course, league, activeTeams, teeTimes, fixtures } = await getCartSignsDataAsync(
    db, adminClient, context.courseId, leagueId, selectedWeek
  );

  if (!course || !league) {
    return <EmptyState title="Course or league information not found" description="Check the workspace connection and try again." primaryHref="/admin" primaryLabel="Back to dashboard" />;
  }

  // Build match signs array
  let matchSigns = [];

  if (teeTimes.length > 0) {
    matchSigns = teeTimes.map(tt => ({
      id: tt.id,
      hole: tt.starting_hole || 1,
      group: tt.starting_group || 'A',
      startTime: tt.start_time || '09:00 AM',
      team1: tt.team1_name || 'Team 1',
      team1Hcp: tt.team1_hcp !== null && tt.team1_hcp !== undefined ? Number(tt.team1_hcp).toFixed(1) : '0.0',
      team2: tt.team2_name || 'Team 2',
      team2Hcp: tt.team2_hcp !== null && tt.team2_hcp !== undefined ? Number(tt.team2_hcp).toFixed(1) : '0.0',
    }));
  } else if (fixtures.length > 0) {
    matchSigns = fixtures.map((f, idx) => {
      const holeNumber = Math.floor(idx / 2) + 1;
      const groupLetter = idx % 2 === 0 ? 'A' : 'B';
      return {
        id: f.id,
        hole: holeNumber,
        group: groupLetter,
        startTime: f.scheduled_time || '09:00 AM',
        team1: f.team1_name || 'Team 1',
        team1Hcp: f.team1_hcp !== null && f.team1_hcp !== undefined ? Number(f.team1_hcp).toFixed(1) : '0.0',
        team2: f.is_bye ? 'BYE (Practice Round)' : (f.team2_name || 'Team 2'),
        team2Hcp: f.team2_hcp !== null && f.team2_hcp !== undefined ? Number(f.team2_hcp).toFixed(1) : '0.0',
      };
    });
  } else if (activeTeams.length > 0) {
    // Generate pairings from active team roster
    for (let i = 0; i < activeTeams.length; i += 2) {
      const pairIndex = Math.floor(i / 2);
      const holeNumber = (Math.floor(pairIndex / 2) % 18) + 1;
      const groupLetter = pairIndex % 2 === 0 ? 'A' : 'B';

      const t1 = activeTeams[i];
      const t2 = activeTeams[i + 1];

      matchSigns.push({
        id: `auto_${i}`,
        hole: holeNumber,
        group: groupLetter,
        startTime: '09:00 AM Shotgun',
        team1: t1?.name || `Team ${i + 1}`,
        team1Hcp: t1?.current_handicap !== undefined ? Number(t1.current_handicap).toFixed(1) : '0.0',
        team2: t2 ? t2.name : 'BYE (Single Flight)',
        team2Hcp: t2?.current_handicap !== undefined ? Number(t2.current_handicap).toFixed(1) : '0.0',
      });
    }
  }

  // Weeks list for selector
  const maxWeeks = 10;
  const weeksList = Array.from({ length: maxWeeks }, (_, i) => i + 1);

  return (
    <div style={{ padding: '2rem', minHeight: '100vh', background: '#f8fafc', color: 'var(--color-text-main)' }}>

      {/* ─── SCREEN ONLY HEADER ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }} className="no-print">
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <GolfCartIcon size={16} color="#059669" />
            <span style={{ fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase', color: '#047857' }}>
              Bag Drop & Cart Fleet Studio
            </span>
          </div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>Golf Cart Faceplate Signs</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>
            High-resolution printable faceplates for Week {selectedWeek} pairings with starting holes and player handicaps.
          </p>
        </div>
        <PrintButton />
      </div>

      {/* ─── ROUND / WEEK SELECTOR ──────────────────────────────────────────────── */}
      <div className="no-print birvo-card" style={{ padding: '1rem 1.25rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
          Select Round:
        </span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {weeksList.map(w => {
            const isActive = w === selectedWeek;
            return (
              <Link
                key={w}
                href={`/admin/cart-signs?week=${w}`}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  textDecoration: 'none',
                  background: isActive ? '#059669' : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#334155',
                  border: isActive ? '1px solid #047857' : '1px solid #e2e8f0',
                  transition: 'all 0.15s ease'
                }}
              >
                Week {w} {w === currentWeek && '★'}
              </Link>
            );
          })}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .no-print { display: none !important; }
          .sign-card { page-break-inside: avoid; border: 3px solid #000000 !important; margin-bottom: 2rem !important; }
          body { background: white !important; margin: 0; padding: 0; }
        }
      `}} />

      {matchSigns.length === 0 ? (
        <div className="birvo-card" style={{ textAlign: 'center', padding: '4rem 1rem', background: '#ffffff', color: 'var(--color-text-muted)' }}>
          <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem', color: 'var(--color-text-main)', fontWeight: 800 }}>No active teams found.</h3>
          <p style={{ fontSize: '0.95rem' }}>Add teams to {league?.name} to automatically generate printable cart faceplates.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '2rem' }}>
          {matchSigns.map(sign => (
            <div
              key={sign.id}
              className="sign-card birvo-card"
              style={{
                border: '2px solid #0f172a',
                borderRadius: '16px',
                padding: '2.5rem 2rem',
                textAlign: 'center',
                minHeight: '440px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                background: '#ffffff',
                boxShadow: 'var(--card-shadow-lg)'
              }}
            >
              {/* Card Header */}
              <div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  {course.name}
                </div>
                <h2 style={{ fontSize: '1.8rem', color: 'var(--color-text-main)', margin: '6px 0 0 0', fontWeight: 900 }}>
                  {league?.name}
                </h2>
                <div style={{ fontSize: '0.95rem', color: 'var(--color-text-muted)', fontWeight: 700, marginTop: '2px' }}>
                  Week {selectedWeek} Tournament Round
                </div>
              </div>

              {/* Starting Hole Badge */}
              <div style={{ margin: '1.5rem 0' }}>
                <span style={{
                  display: 'inline-block',
                  background: '#047857',
                  color: '#ffffff',
                  fontSize: '1.35rem',
                  fontWeight: 900,
                  padding: '8px 22px',
                  borderRadius: '10px',
                  letterSpacing: '0.5px'
                }}>
                  STARTING HOLE #{sign.hole}{sign.group}
                </span>
                {sign.startTime && (
                  <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, marginTop: '6px' }}>
                    {sign.startTime}
                  </div>
                )}
              </div>

              {/* Matchup Teams */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--color-text-main)' }}>{sign.team1}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>Handicap Index: {sign.team1Hcp}</div>
                </div>

                <div style={{ fontSize: '1rem', color: '#059669', fontStyle: 'italic', fontWeight: 900 }}>VS</div>

                <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--color-text-main)' }}>{sign.team2}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>Handicap Index: {sign.team2Hcp}</div>
                </div>
              </div>

              {/* Card Footer */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px', fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '1.5rem', fontWeight: 600 }}>
                Official Simple League Handicap • Birvo Tournament System
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
