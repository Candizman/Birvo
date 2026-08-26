import db from '../../../lib/database';
import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import {
  SettingsIcon,
  CalendarIcon,
  WeatherRainIcon,
  SparklesIcon,
  PrinterIcon,
  ShieldCheckIcon
} from '../../../components/icons/GolfIcons';
import EmptyState from '../../../components/ui/EmptyState';
import { getRoundCloseReadiness } from '../../../lib/services/roundLifecycleService';
import { FinalizeRoundForm, RainoutForm } from './RoundOperations';
import { createPublicAccessToken, getPublicLinkVersion as getLocalPublicLinkVersion } from '../../../lib/publicAccess';
import PublicLinkControls from './PublicLinkControls';
import dataBackend from '../../../lib/data/backend';
import dashboardRepository from '../../../lib/data/supabase/dashboardRepository';
import publicAccessRepository from '../../../lib/data/supabase/publicAccessRepository';
import { createClient } from '../../../lib/supabase/server';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export default async function SettingsPage() {
  const context = await getAdminContext();
  if (!context) return <EmptyState title="Admin session required" description="Sign in to access league operations settings." primaryHref="/login" primaryLabel="Sign in" />;
  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) {
    return <EmptyState eyebrow="Restricted area" title="Course manager access required" description="Only course owners and managers can advance weeks or change league operations settings." primaryHref="/admin" primaryLabel="Back to overview" />;
  }

  const courseId = context.courseId;
  const activeDataBackend = resolveDataBackend();
  const supabase = activeDataBackend === DATA_BACKENDS.SUPABASE ? await createClient() : null;
  const operationsSnapshot = context.leagueId && supabase
    ? await dashboardRepository.getLeagueOperationsSnapshot(supabase, {
        courseId,
        leagueId: context.leagueId,
        weekNumber: context.currentWeek,
      })
    : null;
  const league = context.leagueId
    ? (operationsSnapshot?.league || (!supabase
        ? db.prepare('SELECT id, name FROM leagues WHERE id = ? AND course_id = ? AND status = ?').get(context.leagueId, courseId, 'active')
        : null))
    : null;
  if (!league) {
    return <EmptyState title="No active league to configure" description="Create an active league before using schedule, postponement, and week-closing tools." primaryHref="/admin/leagues" primaryLabel="Create league" />;
  }
  const readiness = operationsSnapshot?.readiness || getRoundCloseReadiness(db, league.id, context.currentWeek);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const linkVersions = supabase
    ? await publicAccessRepository.getPublicLinkVersions(supabase, { courseId, leagueId: league.id })
    : {
        standings: getLocalPublicLinkVersion(db, league.id, 'standings'),
        tv: getLocalPublicLinkVersion(db, league.id, 'tv'),
        player: getLocalPublicLinkVersion(db, league.id, 'player'),
      };
  const standingsToken = createPublicAccessToken({ leagueId: league.id, purpose: 'standings', version: linkVersions.standings });
  const tvToken = createPublicAccessToken({ leagueId: league.id, purpose: 'tv', version: linkVersions.tv });
  const playerToken = createPublicAccessToken({ leagueId: league.id, purpose: 'player', version: linkVersions.player });
  const publicLinks = {
    standings: standingsToken ? `${baseUrl}/standings?leagueId=${league.id}&access=${encodeURIComponent(standingsToken)}` : null,
    tv: tvToken ? `${baseUrl}/tv/${league.id}?access=${encodeURIComponent(tvToken)}` : null,
    player: playerToken ? `${baseUrl}/join/${league.id}?access=${encodeURIComponent(playerToken)}` : null,
  };

  return (
    <div className="container" style={{ padding: 0, maxWidth: '1000px' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <SettingsIcon size={14} color="#059669" />
            <span style={{ color: '#047857', fontSize: '0.82rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Operations & Rules
            </span>
          </div>
          <h1 style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>
            League Operations & Settings
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px', fontSize: '0.95rem' }}>
            Finalize weekly rounds, manage weather rainout postponements, and generate clubhouse registration signs.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '2rem' }}>

        {/* Finalize Round (Advance Week) */}
        <div className="birvo-card" style={{ padding: '2rem', background: '#ffffff' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <CalendarIcon size={24} color="#059669" />
          </div>
          <h2 style={{ color: 'var(--color-text-main)', margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: 800 }}>
            Finalize Round (Advance Week)
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
            Current Round: <strong style={{ color: 'var(--color-text-main)' }}>Week {context.currentWeek}</strong>. When all cards are attested and approved, click below to lock Week {context.currentWeek} and advance the schedule to Week {context.currentWeek + 1}.
          </p>

          <FinalizeRoundForm leagueId={league.id} currentWeek={context.currentWeek} readiness={readiness} />
        </div>

        {/* Weather Rainout / Postponement */}
        <div className="birvo-card" style={{ padding: '2rem', background: '#ffffff' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <WeatherRainIcon size={24} color="#dc2626" />
          </div>
          <h2 style={{ color: 'var(--color-text-main)', margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: 800 }}>
            Weather Rainout Shift
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '1.75rem' }}>
            If lightning or course aeration cancels play, shift all remaining matches by 1 week without player forfeit penalties.
          </p>

          <RainoutForm leagueId={league.id} />
        </div>

        {/* Self-Registration QR Poster */}
        <div className="birvo-card" style={{ padding: '2rem', gridColumn: '1 / -1', background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '2rem' }}>
            <div>
              <h2 style={{ color: 'var(--color-text-main)', margin: '0 0 0.5rem 0', fontSize: '1.3rem', fontWeight: 800 }}>
                Pro Shop Self-Registration QR Poster
              </h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', lineHeight: 1.6, maxWidth: '500px', margin: 0 }}>
                Display this high-resolution QR code in the clubhouse locker room or pro shop counter for instant self-registration into {league.name}.
              </p>
            </div>

            <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '12px', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--card-shadow)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {playerToken ? <img src={`/api/qr?leagueId=${league.id}&access=${encodeURIComponent(playerToken)}`} alt="League registration QR code" style={{ width: '160px', height: '160px' }} /> : <div role="alert" style={{ width: 160, padding: 14, color: '#991b1b', fontSize: '.78rem' }}>Define PUBLIC_LINK_SECRET to enable registration QR codes.</div>}
            </div>
          </div>
        </div>

        <div className="birvo-card" style={{ padding: '2rem', gridColumn: '1 / -1', background: '#ffffff' }}>
          <h2 style={{ margin: '0 0 .4rem', fontSize: '1.3rem' }}>Public Link Security</h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--color-text-muted)', fontSize: '.88rem' }}>Rotate a link immediately if a QR code or URL was shared with the wrong audience. Rotation cannot be undone.</p>
          <PublicLinkControls leagueId={league.id} links={publicLinks} />
        </div>

      </div>

    </div>
  );
}
