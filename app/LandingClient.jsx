import Link from 'next/link';
import BrandMark from '../components/BrandMark';
import {
  CalendarIcon,
  CheckIcon,
  FlagstickIcon,
  LeaderboardIcon,
  PrinterIcon,
  ShieldCheckIcon,
  TargetIcon,
  TvIcon,
  UsersIcon,
} from '../components/icons/GolfIcons';
import styles from './landing.module.css';

const capabilities = [
  {
    icon: CalendarIcon,
    title: 'Season planning',
    description: 'Manage league weeks, matchups, and course operations from one calendar.',
  },
  {
    icon: TargetIcon,
    title: 'Reliable calculations',
    description: 'Keep handicap snapshots, net scores, and points rules consistent and auditable.',
  },
  {
    icon: LeaderboardIcon,
    title: 'Live results',
    description: 'Give players, staff, and spectators one up-to-date source of truth.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Course-level data boundaries',
    description: 'Keep each facility’s leagues, teams, and users inside its own workspace.',
  },
];

const workflows = [
  {
    number: '01',
    title: 'Set up your course',
    description: 'Define tee boxes, holes, local rules, and branding details.',
  },
  {
    number: '02',
    title: 'Create the league',
    description: 'Choose the format, teams, season weeks, and participation rules.',
  },
  {
    number: '03',
    title: 'Run scoring',
    description: 'Let staff or players enter scores while Birvo validates and calculates results.',
  },
  {
    number: '04',
    title: 'Publish results',
    description: 'Power live standings, clubhouse TV, and printed materials from the same data.',
  },
];

const operatorFeatures = [
  'Manage multiple leagues and seasons at the same course',
  'Use bulk scoring and mobile scorecards side by side',
  'Track missing or questionable entries in a reconciliation queue',
  'Generate cart signs, TV displays, and reports without re-entering data',
];

const plans = [
  {
    name: 'Pilot',
    eyebrow: 'Digitize your first league',
    description: 'Validate Birvo with your real staff through one course and a focused season.',
    features: ['Guided setup', 'League and team management', 'Live standings'],
  },
  {
    name: 'Club',
    eyebrow: 'Built for daily operations',
    description: 'Support multiple leagues, staff roles, and in-club publishing tools.',
    features: ['Multiple leagues', 'Roles and audit trail', 'TV and print tools'],
    featured: true,
  },
  {
    name: 'Multi-Course',
    eyebrow: 'For course groups',
    description: 'Scale across multiple facilities while keeping operations controlled and consistent.',
    features: ['Central portfolio view', 'Facility-level data boundaries', 'Custom integration plan'],
  },
];

function ProductPreview() {
  return (
    <div className={styles.productPreview} aria-label="Birvo operations dashboard preview">
      <div className={styles.previewTopbar}>
        <div className={styles.previewBrand}>
          <span className={styles.previewLogo}>B</span>
          <div>
            <strong>Birvo Operations</strong>
            <span>Pine Valley Golf Club</span>
          </div>
        </div>
        <span className={styles.livePill}><i /> Week 6 live</span>
      </div>

      <div className={styles.previewGrid}>
        <aside className={styles.previewSidebar}>
          <span className={styles.previewNavActive}>Overview</span>
          <span>Score entry</span>
          <span>Schedule</span>
          <span>Players</span>
          <span>Publishing</span>
        </aside>

        <div className={styles.previewContent}>
          <div className={styles.previewHeading}>
            <div>
              <span>Wednesday Night League</span>
              <strong>Operations center</strong>
            </div>
            <button type="button">Open scoring</button>
          </div>

          <div className={styles.metricGrid}>
            <div><span>Active teams</span><strong>12</strong><small>12 / 12 ready</small></div>
            <div><span>Score status</span><strong>9</strong><small>3 cards pending</small></div>
            <div><span>Start time</span><strong>5:30 PM</strong><small>Shotgun start</small></div>
          </div>

          <div className={styles.previewTable}>
            <div className={styles.previewTableHead}><span>Rank</span><span>Team</span><span>Net</span><span>Pts</span></div>
            <div><span className={styles.rank}>1</span><strong>North Fairway</strong><span>68.4</span><b>18</b></div>
            <div><span className={styles.rank}>2</span><strong>Oak & Iron</strong><span>69.1</span><b>15</b></div>
            <div><span className={styles.rank}>3</span><strong>Sunday Players</strong><span>70.0</span><b>12</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingClient() {
  return (
    <div className={styles.marketingPage}>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <Link href="/" aria-label="Birvo home">
            <BrandMark />
          </Link>

          <nav className={styles.mainNav} aria-label="Main navigation">
            <a href="#platform">Platform</a>
            <a href="#workflow">Workflow</a>
            <a href="#operations">Operations</a>
            <a href="#plans">Plans</a>
          </nav>

          <div className={styles.headerActions}>
            <Link className={styles.textLink} href="/login">Admin sign in</Link>
            <Link className={styles.primaryButtonSmall} href="/login">Start a pilot</Link>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}><FlagstickIcon size={16} /> League operations for golf courses</div>
              <h1>Run golf operations<br /><em>from one place.</em></h1>
              <p>
                Birvo helps golf course operators manage leagues, scoring, player communication, and clubhouse publishing under their own brand.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} href="/login">Explore Birvo <span>→</span></Link>
                <a className={styles.secondaryButton} href="#workflow">See how it works</a>
              </div>
              <div className={styles.heroFootnote}>
                <ShieldCheckIcon size={18} />
                <span>Web-based · No installation · One workspace per course</span>
              </div>
            </div>

            <ProductPreview />
          </div>
        </section>

        <section className={styles.capabilityStrip} id="platform">
          <div className={styles.capabilityGrid}>
            {capabilities.map(({ icon: Icon, title, description }) => (
              <article key={title}>
                <span className={styles.iconTile}><Icon size={22} /></span>
                <div><h2>{title}</h2><p>{description}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.workflowSection} id="workflow">
          <div className={styles.sectionIntro}>
            <span className={styles.sectionKicker}>One connected workflow</span>
            <h2>Stop juggling spreadsheets, group chats, and disconnected scoring tools.</h2>
            <p>Birvo connects every task your course staff handles into one operational flow.</p>
          </div>

          <div className={styles.workflowGrid}>
            {workflows.map((item) => (
              <article key={item.number}>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.operationsSection} id="operations">
          <div className={styles.operationsVisual}>
            <div className={styles.orbit} aria-hidden="true">
              <span className={styles.orbitCore}><BrandMark compact theme="dark" /></span>
              <span className={`${styles.orbitItem} ${styles.orbitItemOne}`}><UsersIcon size={22} /> Players</span>
              <span className={`${styles.orbitItem} ${styles.orbitItemTwo}`}><TvIcon size={22} /> Clubhouse TV</span>
              <span className={`${styles.orbitItem} ${styles.orbitItemThree}`}><PrinterIcon size={22} /> Print</span>
              <span className={`${styles.orbitItem} ${styles.orbitItemFour}`}><LeaderboardIcon size={22} /> Results</span>
            </div>
          </div>

          <div className={styles.operationsCopy}>
            <span className={styles.sectionKicker}>Designed for course staff</span>
            <h2>Enter data once.<br />Use it correctly everywhere.</h2>
            <p>
              Every weekly score flows from one source into the leaderboard, player portal, clubhouse TV, and reports.
            </p>
            <ul>
              {operatorFeatures.map((feature) => (
                <li key={feature}><CheckIcon size={17} /> {feature}</li>
              ))}
            </ul>
            <Link href="/admin" className={styles.inlineLink}>View the operations dashboard <span>→</span></Link>
          </div>
        </section>

        <section className={styles.roleSection}>
          <div className={styles.sectionIntroCentered}>
            <span className={styles.sectionKicker}>The right view for every role</span>
            <h2>Each user sees only what they need.</h2>
          </div>
          <div className={styles.roleGrid}>
            <article>
              <span>01 / COURSE OPERATOR</span>
              <h3>Complete operational visibility</h3>
              <p>Active leagues, missing scores, course settings, and publishing tools in one dashboard.</p>
            </article>
            <article>
              <span>02 / SCORING STAFF</span>
              <h3>Fast, controlled entry</h3>
              <p>Bulk entry, server-side validation, and transactional writes keep every update reliable.</p>
            </article>
            <article>
              <span>03 / PLAYER</span>
              <h3>Simple on any phone</h3>
              <p>A personal scorecard, weekly status, and season standings are always one tap away.</p>
            </article>
          </div>
        </section>

        <section className={styles.plansSection} id="plans">
          <div className={styles.sectionIntroCentered}>
            <span className={styles.sectionKicker}>Grows with your course</span>
            <h2>Start with what you need.</h2>
            <p>Final packaging and pricing will be set after pilot-course requirements are validated.</p>
          </div>

          <div className={styles.planGrid}>
            {plans.map((plan) => (
              <article key={plan.name} className={plan.featured ? styles.featuredPlan : undefined}>
                {plan.featured && <span className={styles.planBadge}>Recommended</span>}
                <small>{plan.eyebrow}</small>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
                <ul>
                  {plan.features.map((feature) => <li key={feature}><CheckIcon size={16} /> {feature}</li>)}
                </ul>
                <Link href="/login">Start a conversation <span>→</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <div>
            <span className={styles.sectionKickerLight}>For your next league</span>
            <h2>Give your staff a better system—not another spreadsheet.</h2>
          </div>
          <div>
            <p>Start with one league and shape Birvo around the way your course actually operates.</p>
            <Link href="/login">Open a pilot workspace <span>→</span></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <BrandMark theme="dark" />
        <p>League and tournament operations for golf courses.</p>
        <div>
          <a href="#workflow">How it works</a>
          <Link href="/login">Admin sign in</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <span>© 2026 Birvo</span>
        </div>
      </footer>
    </div>
  );
}
