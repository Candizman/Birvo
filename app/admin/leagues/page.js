import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import { createLeague, updateLeagueFormat, generatePlayoffAction, setHandicapMethod } from './actions';
import EmptyState from '../../../components/ui/EmptyState';
import {
  TrophyIcon,
  SparklesIcon,
  FlagstickIcon,
} from '../../../components/icons/GolfIcons';
import { createClient } from '../../../lib/supabase/server';

function readBracket(value) {
  try {
    const bracket = typeof value === 'string' ? JSON.parse(value) : value;
    return bracket && Array.isArray(bracket.quarterOrSemis) ? bracket : null;
  } catch {
    return null;
  }
}

export default async function LeaguesPage() {
  const context = await getAdminContext();
  if (!context) return <div style={{ padding: '2rem', color: 'white' }}>Please log in to continue.</div>;
  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) {
    return <EmptyState eyebrow="Restricted area" title="Course manager access required" description="Only course owners and managers can create leagues, change formats, or generate playoff brackets." primaryHref="/admin" primaryLabel="Back to overview" />;
  }

  const courseId = context.courseId;
  const { listCourseLeagues } = require('../../../lib/services/leagueService');
  const leagues = await listCourseLeagues(await createClient(), courseId);

  return (
    <div className="container" style={{ padding: 0, maxWidth: '100%' }}>

      {/* ─── HEADER ─────────────────────────────────────────────────────────────── */}
      <header className="flex-between" style={{ marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)', padding: '4px 12px', borderRadius: '16px', marginBottom: '0.5rem' }}>
            <TrophyIcon size={14} color="#d4af37" />
            <span style={{ color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase' }}>
              Format & Bracket Engine
            </span>
          </div>
          <h1 className="title-gold" style={{ fontSize: '2.2rem', margin: 0, fontWeight: 900 }}>
            League & Tournament Management
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Configure tournament scoring formats, multi-flight divisions, and championship elimination playoff brackets.
          </p>
        </div>
      </header>

      {/* ─── NEW LEAGUE FORM ────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
        <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SparklesIcon size={18} color="#d4af37" /> Launch New League Season
        </h2>
        <form action={createLeague} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <input type="hidden" name="courseId" value={courseId} />

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>League / Tournament Name</label>
            <input
              type="text"
              name="leagueName"
              required
              placeholder="e.g. 2026 Spring Evening League"
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.95rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Season Length (Weeks)</label>
            <input type="number" name="seasonLengthWeeks" defaultValue="12" min="1" max="52" required style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.95rem' }} />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>Game Scoring Format</label>
            <select name="gameFormat" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.95rem' }}>
              <option value="stroke_play">Stroke Play (Gross & Net)</option>
              <option value="match_play">Match Play 1v1 (Hole-by-Hole)</option>
              <option value="stableford">Stableford Point System</option>
              <option value="scramble">Scramble (USGA Team Handicap)</option>
              <option value="skins">Skins Game (Carry-over Pots)</option>
              <option value="nassau">Nassau (Front / Back / Overall)</option>
            </select>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" style={{ padding: '12px 28px', borderRadius: '8px', border: 'none', background: 'var(--color-primary)', color: '#080c14', fontWeight: 800, cursor: 'pointer' }}>
              + Launch Tournament League
            </button>
          </div>
        </form>
      </div>

      {/* ─── ACTIVE LEAGUES TABLE ───────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '2rem', marginBottom: '2.5rem', overflowX: 'auto' }}>
        <h2 className="title-primary" style={{ fontSize: '1.3rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FlagstickIcon size={18} color="#10b981" /> Active Tournament Leagues
        </h2>
        <table style={{ width: '100%', minWidth: '700px', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px' }}>League Name</th>
              <th style={{ padding: '12px' }}>Current Format</th>
              <th style={{ padding: '12px' }}>Handicap Method</th>
              <th style={{ padding: '12px' }}>Current Round</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Playoff Bracket</th>
            </tr>
          </thead>
          <tbody>
            {leagues.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '14px 12px', fontWeight: 700, color: 'white' }}>{l.name}</td>
                <td style={{ padding: '14px 12px' }}>
                  <form action={updateLeagueFormat} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="hidden" name="leagueId" value={l.id} />
                    <select
                      name="gameFormat"
                      defaultValue={l.game_format || 'stroke_play'}
                      style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
                    >
                      <option value="stroke_play">Stroke Play</option>
                      <option value="match_play">Match Play</option>
                      <option value="stableford">Stableford</option>
                      <option value="scramble">Scramble</option>
                      <option value="skins">Skins</option>
                      <option value="nassau">Nassau</option>
                    </select>
                    <button type="submit" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '0.78rem', fontWeight: 750, cursor: 'pointer' }}>
                      Save format
                    </button>
                  </form>
                </td>
                <td style={{ padding: '14px 12px' }}>
                  {/* Frozen once the league has scores, the same as the game format:
                      a season cannot change how it calculates handicaps mid-way. */}
                  <form action={setHandicapMethod} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <input type="hidden" name="leagueId" value={l.id} />
                    <select
                      name="handicapMethod"
                      defaultValue={l.handicap_method || 'whs'}
                      title="How each team's handicap is calculated from their scores"
                      style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--color-border)', color: 'var(--color-primary)', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}
                    >
                      <option value="whs">World Handicap System</option>
                      <option value="best_of">Best half of last 10</option>
                      <option value="league_average">Average of all rounds</option>
                    </select>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                      <input
                        type="number"
                        name="allowancePercent"
                        defaultValue={l.handicap_allowance_percent ?? 80}
                        min="50"
                        max="100"
                        title="Share of the handicap actually given. 80% is the common league setting."
                        style={{ width: '58px', padding: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--color-border)', color: 'white', borderRadius: '6px', fontSize: '0.85rem', textAlign: 'center', fontWeight: 700 }}
                      />
                      %
                    </label>
                    <button type="submit" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.06)', color: 'white', fontSize: '0.78rem', fontWeight: 750, cursor: 'pointer' }}>
                      Save
                    </button>
                  </form>
                </td>
                <td style={{ padding: '14px 12px', color: '#38bdf8', fontWeight: 700 }}>Week {l.current_week}</td>
                <td style={{ padding: '14px 12px' }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: l.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                    color: l.status === 'active' ? '#4ade80' : '#94a3b8'
                  }}>
                    {l.status === 'active' ? 'Active' : l.status}
                  </span>
                </td>
                <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                  <form action={generatePlayoffAction} style={{ display: 'inline' }}>
                    <input type="hidden" name="leagueId" value={l.id} />
                    <input type="hidden" name="bracketSize" value="4" />
                    <button type="submit" style={{ padding: '8px 14px', background: 'rgba(212, 175, 55, 0.15)', border: '1px solid rgba(212, 175, 55, 0.4)', color: 'var(--color-primary)', borderRadius: '6px', cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem' }}>
                      ⚡ Generate Top 4 Bracket
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── VISUAL SVG PLAYOFF BRACKET TREE ─────────────────────────────────────── */}
      {leagues.some(l => l.playoff_bracket) && (
        <div className="glass-panel" style={{ padding: '2rem' }}>
          <h2 className="title-gold" style={{ fontSize: '1.4rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TrophyIcon size={22} color="#d4af37" /> Championship Play-Off Elimination Tree
          </h2>

          {leagues.filter(l => l.playoff_bracket).map(l => {
            const bracket = readBracket(l.playoff_bracket);
            if (!bracket) return null;
            return (
              <div key={l.id} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ color: '#38bdf8', marginBottom: '1.25rem', fontSize: '1.1rem' }}>
                  {l.name} — Semifinals & Championship Final
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>

                  {/* Semifinals */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {bracket.quarterOrSemis.map(m => (
                      <div key={m.matchNumber} style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 700, textTransform: 'uppercase' }}>
                          Semifinal Match #{m.matchNumber}
                        </div>
                        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', marginBottom: '6px', fontWeight: 700, color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Seed #{m.highSeed?.seed}: {m.highSeed?.name || 'TBD'}</span>
                        </div>
                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.75rem', margin: '2px 0' }}>VS</div>
                        <div style={{ padding: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', fontWeight: 700, color: 'white', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Seed #{m.lowSeed?.seed}: {m.lowSeed?.name || 'TBD'}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Finals Showcase */}
                  <div style={{
                    padding: '2rem',
                    background: 'radial-gradient(ellipse at center, rgba(212, 175, 55, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%)',
                    border: '2px solid var(--color-primary)',
                    borderRadius: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    textAlign: 'center',
                    boxShadow: '0 10px 30px rgba(212, 175, 55, 0.2)'
                  }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                      <TrophyIcon size={30} color="#080c14" />
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-primary)', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
                      CHAMPIONSHIP FINAL
                    </div>
                    <h4 style={{ fontSize: '1.4rem', color: 'white', margin: '0.5rem 0', fontWeight: 900 }}>
                      Winner Semi 1 vs Winner Semi 2
                    </h4>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', margin: 0 }}>
                      18-Hole Match Play Championship
                    </p>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
