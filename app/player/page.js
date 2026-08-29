import { submitPlayerScore } from './actions';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPlayerSession } from '../../lib/auth';
import { createAdminClient } from '../../lib/supabase/admin';
import { getPlayerHomeAsync } from '../../lib/services/playerService';
import {
  FlagstickIcon,
  TrophyIcon,
  SparklesIcon,
  TargetIcon,
  UserIcon,
  GolfBallIcon,
  CalendarIcon,
  ShieldCheckIcon
} from '../../components/icons/GolfIcons';

export default async function PlayerMobile() {
  const session = await getPlayerSession();

  if (!session?.teamId) {
    redirect('/player/login');
  }

  const teamId = session.teamId;
  const adminClient = createAdminClient();
  const home = await getPlayerHomeAsync(adminClient, teamId);
  if (!home) redirect('/player/login');

  const { team, league, course, opponentName, teamSeasonData, fixture, startingHole } = home;
  const currentMatch = fixture ? { ...fixture, starting_hole: startingHole } : null;
  const currentWeek = league.current_week;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '2rem 1rem 6rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>

        {/* ─── LUXURY COUNTRY CLUB MEMBER CARD ─────────────────────────────────── */}
        <div className="birvo-card" style={{
          padding: '1.75rem',
          borderRadius: '20px',
          background: 'linear-gradient(135deg, #047857 0%, #065f46 100%)',
          boxShadow: '0 10px 25px -5px rgba(4, 120, 87, 0.35)',
          marginBottom: '1.25rem',
          position: 'relative',
          color: '#ffffff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: '#a7f3d0', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
                {course.name}
              </div>
              <h1 style={{ fontSize: '1.65rem', color: '#ffffff', margin: '4px 0 0 0', fontWeight: 900, letterSpacing: '-0.02em' }}>
                {team.name}
              </h1>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.png"
              alt="Birvo Member Badge"
              style={{
                width: '36px',
                height: '36px',
                objectFit: 'contain'
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: '#d1fae5', fontWeight: 700, letterSpacing: '0.5px' }}>HANDICAP INDEX</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
                {Number(team.current_handicap).toFixed(1)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: '#d1fae5', fontWeight: 700, letterSpacing: '0.5px' }}>SEASON RANK</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fef08a', marginTop: '2px' }}>
                {teamSeasonData ? `#${teamSeasonData.seasonRank}` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* ─── UPCOMING MATCHUP SCOUTING CARD ──────────────────────────────────── */}
        <div className="birvo-card" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem', background: '#ffffff', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Week {currentWeek} Matchup
            </span>
            <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 800, background: 'var(--color-primary-light)', padding: '3px 10px', borderRadius: '9999px' }}>
              Hole #{currentMatch?.starting_hole || '1A'}
            </span>
          </div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text-main)' }}>
            vs. {opponentName}
          </div>
        </div>

        {/* ─── LIVE HOLE-BY-HOLE SCORECARD ─────────────────────────────────────── */}
        <Link href="/player/live-tracker" style={{ textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
          <div style={{
            padding: '1.25rem',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            color: 'white',
            fontWeight: 800,
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 4px 14px rgba(5, 150, 105, 0.25)',
            cursor: 'pointer',
            transition: 'transform 0.15s'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <TargetIcon size={24} color="white" />
              <div>
                <div>Live Hole-by-Hole Scorecard</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                  Gross score, putts, fairways, greens & attestation
                </div>
              </div>
            </div>
            <span style={{ fontSize: '1.2rem' }}>→</span>
          </div>
        </Link>

        {/* ─── QUICK GROSS SUBMISSION CARD ─────────────────────────────────────── */}
        <form action={submitPlayerScore} className="birvo-card" style={{ padding: '1.75rem', textAlign: 'center', marginBottom: '1.25rem', background: '#ffffff', borderRadius: '16px' }}>
          <label style={{ display: 'block', color: 'var(--color-text-main)', marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 700 }}>
            Quick 18-Hole Gross Scorecard Entry
          </label>
          <input
            type="number"
            name="grossScore"
            min="1"
            max="200"
            step="1"
            inputMode="numeric"
            placeholder="72"
            required
            style={{
              background: '#f8fafc',
              border: '2px solid var(--color-primary)',
              color: 'var(--color-text-main)',
              padding: '0.75rem',
              borderRadius: '12px',
              width: '100%',
              fontSize: '2.8rem',
              textAlign: 'center',
              fontWeight: 900,
              marginBottom: '1rem',
              outline: 'none',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.04)'
            }}
          />
          <button type="submit" className="birvo-btn-primary" style={{ width: '100%', padding: '12px', fontSize: '1rem' }}>
            Post Gross Score
          </button>
        </form>

        {/* ─── MEMBER QUICK LINKS ──────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Link href={`/standings?leagueId=${team.league_id}`} style={{ textDecoration: 'none' }}>
            <div className="birvo-card birvo-card-interactive" style={{ padding: '14px', textAlign: 'center', color: 'var(--color-text-main)', fontWeight: 700, fontSize: '0.86rem', background: '#ffffff', borderRadius: '14px' }}>
              <TrophyIcon size={20} color="#059669" style={{ marginBottom: '4px', display: 'block', margin: '0 auto 6px auto' }} />
              Live Standings
            </div>
          </Link>

          <Link href="/player/profile" style={{ textDecoration: 'none' }}>
            <div className="birvo-card birvo-card-interactive" style={{ padding: '14px', textAlign: 'center', color: 'var(--color-text-main)', fontWeight: 700, fontSize: '0.86rem', background: '#ffffff', borderRadius: '14px' }}>
              <UserIcon size={20} color="#0284c7" style={{ marginBottom: '4px', display: 'block', margin: '0 auto 6px auto' }} />
              Bag & Trophies
            </div>
          </Link>
        </div>

      </div>
    </div>
  );
}
