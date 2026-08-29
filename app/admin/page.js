import { getAdminContext } from '../../lib/auth';
import Link from 'next/link';
import EmptyState from '../../components/ui/EmptyState';
import { createPublicAccessToken } from '../../lib/publicAccess';
import { createClient } from '../../lib/supabase/server';
import SetupChecklist from '../../components/ui/SetupChecklist';
import ProgressBar from '../../components/ui/ProgressBar';
import StatCard from '../../components/ui/StatCard';
import RankBadge from '../../components/ui/RankBadge';
import ScoreFeed from '../../components/ui/ScoreFeed';
import AlertBanner from '../../components/ui/AlertBanner';
import {
  FlagstickIcon,
  TrophyIcon,
  SparklesIcon,
  TvIcon,
  CalendarIcon,
  EyeIcon,
  ShieldCheckIcon,
} from '../../components/icons/GolfIcons';
import styles from './dashboard.module.css';

export default async function AdminDashboard() {
  const context = await getAdminContext();

  if (!context) {
    return (
      <EmptyState
        eyebrow="Secure area"
        title="Admin session required"
        description="Sign in with an administrator account to access course operations, player data, and score management."
        primaryHref="/login"
        primaryLabel="Sign in"
      />
    );
  }

  const { courseId, currentWeek: weekNumber } = context;

  if (!courseId) {
    return (
      <EmptyState
        title="Set up your Birvo workspace"
        description="Create your course, then your season and teams, to start using the dashboard."
        primaryHref="/onboarding"
        primaryLabel="Set up workspace"
        steps={['Add course and location details', 'Create the first league and season rules', 'Review tee information before opening scoring']}
      />
    );
  }

  const supabase = await createClient();
  const { getAdminDashboardAsync } = require('../../lib/services/dashboardService');
  const dashboardData = await getAdminDashboardAsync(supabase, courseId, context.leagueId);
  const course = dashboardData.course;

  if (!course) {
    return (
      <EmptyState
        title="Course record not found"
        description="This workspace is not connected to a course. Create a course to complete setup."
        primaryHref="/admin/course"
        primaryLabel="Create course"
      />
    );
  }

  const league = dashboardData.league;
  if (!league) {
    return (
      <EmptyState
        eyebrow="Season setup"
        title="Create your first active league"
        description={`${course.name} does not have an active league yet. Choose the format, season weeks, and scoring rules to get started.`}
        primaryHref="/admin/leagues"
        primaryLabel="Create league"
        secondaryHref="/admin/course"
        secondaryLabel="Review course information"
        steps={['Choose the league format and schedule', 'Add the team or player roster', 'Publish the first week of matchups']}
      />
    );
  }

  const standingsData = dashboardData.standingsData;
  const setupProgress = dashboardData.setupProgress;
  const linkVersions = dashboardData.linkVersions;
  const standingsToken = createPublicAccessToken({ leagueId: league.id, purpose: 'standings', version: linkVersions.standings });
  const tvToken = createPublicAccessToken({ leagueId: league.id, purpose: 'tv', version: linkVersions.tv });
  const { totalActiveTeams, seasonStandings, weeklyResultsList, summary } = standingsData;

  const currentWeekData = weeklyResultsList.find(w => w.weekNumber === weekNumber);
  const weekResults = currentWeekData ? currentWeekData.results : [];
  const scoresEnteredCount = currentWeekData ? currentWeekData.scoresEnteredCount : 0;
  const completionPct = totalActiveTeams > 0 ? Math.round((scoresEnteredCount / totalActiveTeams) * 100) : 0;

  const needsReviewCount = dashboardData.needsReviewCount;
  const recentScores = dashboardData.recentScores;

  return (
    <div className={styles.page}>

      {/* ─── TOURNAMENT HEADER ─────────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div>
          <div className={styles.courseBadge}>
            <FlagstickIcon size={16} color="#059669" />
            <span className={styles.courseBadgeText}>
              {course.name} • {course.city}
            </span>
          </div>
          <h1 className={styles.leagueName}>
            {league.name}
          </h1>
          <p className={styles.leagueMeta}>
            Week {weekNumber} of a {summary.totalWeeks}-week season • Format: <strong className={styles.leagueMetaStrong}>{league.game_format.replace('_', ' ')}</strong> • {totalActiveTeams} active teams
          </p>
        </div>

        {/* Quick Launcher Deck */}
        <div className={styles.quickActions}>
          <Link className="birvo-btn-secondary" href={`/standings?leagueId=${league.id}${standingsToken ? `&access=${standingsToken}` : ''}`} target="_blank">
            <EyeIcon size={18} color="#475569" /> Standings
          </Link>
          <Link className="birvo-btn-secondary" href={`/tv/${league.id}${tvToken ? `?access=${tvToken}` : ''}`} target="_blank" style={{ color: '#047857', borderColor: '#a7f3d0', background: '#ecfdf5' }}>
            <TvIcon size={18} color="#059669" /> Clubhouse TV
          </Link>
          <Link className="birvo-btn-primary" href="/admin/rapid-entry">
            <SparklesIcon size={18} color="#ffffff" /> Rapid score entry
          </Link>
        </div>
      </header>

      <SetupChecklist progress={setupProgress} />

      {/* ─── ROUND SCORING COMPLETION BAR ───────────────────────────────────────── */}
      <div className={`birvo-card ${styles.scoringStatus}`}>
        <div className={styles.scoringStatusHeader}>
          <div className={styles.statusLabel}>
            <div className={styles.statusDot} />
            <strong className={styles.statusLabelText}>
              Week {weekNumber} scoring status
            </strong>
          </div>
          <span className={`${styles.statusCount} ${completionPct === 100 ? styles.statusComplete : styles.statusInProgress}`}>
            {scoresEnteredCount} of {totalActiveTeams} teams complete ({completionPct}%)
          </span>
        </div>

        <ProgressBar value={completionPct} label={`Week ${weekNumber} scoring completion`} />
      </div>

      {/* ─── TOURNAMENT KPI CARDS ───────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        <StatCard
          label="Season Leader"
          value={summary.leader ? summary.leader.name : 'No scores yet'}
          description={summary.leader ? `${summary.leader.totalPoints} total points` : 'Season starting'}
          labelColor="#b45309"
        />
        <StatCard
          label="Active Roster"
          value={totalActiveTeams}
          unit="Teams"
          description="Active teams on the league roster"
          labelColor="#047857"
        />
        <StatCard
          label="League Net Average"
          value={summary.leagueAvgNet !== null ? summary.leagueAvgNet : '-'}
          description="Calculated net average across the season"
          labelColor="#0369a1"
          valueColor="#0284c7"
        />
        <StatCard
          label="Schedule Progress"
          value={`${summary.completedWeeks} / ${summary.totalWeeks}`}
          description="Completed weeks"
          labelColor="#065f46"
          valueColor="#059669"
        />
      </div>

      {/* ─── AUDIT & DISPUTE ALERTS ─────────────────────────────────────────────── */}
      {needsReviewCount > 0 && (
        <div className={styles.alertSection}>
          <AlertBanner
            variant="danger"
            actionHref="/admin/reconciliation"
            actionLabel="Review and resolve →"
          >
            <strong>Scorecard alert:</strong> {needsReviewCount} records are awaiting handicap review.
          </AlertBanner>
        </div>
      )}

      {/* ─── 2-COLUMN GRID: WEEKLY SCORING + RECENT ATTESTATION FEED ─────────────── */}
      <div className={styles.contentGrid}>

        {/* Current Week Matchup / Scoring */}
        <div className={`birvo-card ${styles.sectionCard}`}>
          <div className={styles.sectionHeader}>
            <h2 className={`title-primary ${styles.sectionTitle}`}>
              <CalendarIcon size={20} color="#059669" /> Week {weekNumber} standings
            </h2>
            <Link href="/admin/rapid-entry" className={styles.sectionAction}>
              + Enter scores
            </Link>
          </div>

          {weekResults.length > 0 ? (
            <table className={`${styles.standingsTable} tabular-nums`}>
              <thead>
                <tr className={styles.standingsTableHead}>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th>Team</th>
                  <th style={{ textAlign: 'center' }}>Gross</th>
                  <th style={{ textAlign: 'center' }}>Net</th>
                  <th style={{ textAlign: 'right' }}>Points</th>
                </tr>
              </thead>
              <tbody>
                {[...weekResults].sort((a, b) => (b.pointsEarned || 0) - (a.pointsEarned || 0)).map((team, idx) => (
                  <tr key={team.id} className={idx % 2 === 0 ? styles.standingsTableRowEven : styles.standingsTableRow}>
                    <td style={{ padding: '12px 10px' }}><RankBadge rank={team.rank} /></td>
                    <td className={styles.teamName} style={{ padding: '12px 10px' }}>{team.name}</td>
                    <td className={styles.grossScore} style={{ padding: '12px 10px' }}>{team.currentGross}</td>
                    <td className={styles.netScore} style={{ padding: '12px 10px' }}>{team.netScore !== null ? team.netScore.toFixed(1) : '-'}</td>
                    <td className={styles.points} style={{ padding: '12px 10px' }}>
                      {team.pointsEarned.toFixed(1)} <span className={styles.pointsUnit}>PTS</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.emptyContent}>
              No scores have been entered for this week yet.
            </div>
          )}
        </div>

        {/* Recent Score Activity & Attestation Feed */}
        <div className={`birvo-card ${styles.sectionCard}`}>
          <div className={styles.sectionHeader}>
            <h2 className={`title-primary ${styles.sectionTitle}`}>
              <ShieldCheckIcon size={20} color="#059669" /> Recent score entries
            </h2>
          </div>

          <ScoreFeed scores={recentScores} />
        </div>

      </div>

    </div>
  );
}
