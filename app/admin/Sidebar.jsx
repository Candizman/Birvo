'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BrandMark from '../../components/BrandMark';
import {
  LeaderboardIcon,
  FlagstickIcon,
  TrophyIcon,
  TvIcon,
  CalendarIcon,
  SparklesIcon,
  PrinterIcon,
  ReceiptIcon,
  DollarSignIcon,
  SettingsIcon,
  TrashIcon,
  SearchIcon,
  TargetIcon,
  UsersIcon,
  ShieldCheckIcon,
} from '../../components/icons/GolfIcons';
import styles from './sidebar.module.css';

const MANAGEMENT_ROLES = new Set(['superadmin', 'course_owner', 'course_admin', 'admin']);

const getNavGroups = (leagueId, standingsToken, role) => {
  const canManageCourse = MANAGEMENT_ROLES.has(role);
  return [
  {
    group: 'League & scoring',
    items: [
      { name: 'Overview', href: '/admin', icon: LeaderboardIcon },
      { name: 'Rapid score entry', href: '/admin/rapid-entry', icon: SparklesIcon },
      { name: 'Score corrections', href: '/admin/corrections', icon: ShieldCheckIcon },
      { name: 'Live standings', href: leagueId ? `/standings?leagueId=${leagueId}${standingsToken ? `&access=${standingsToken}` : ''}` : '/standings', icon: TrophyIcon },
      { name: 'Handicap roster', href: '/admin/handicaps', icon: TargetIcon },
      { name: 'Schedule & matchups', href: '/admin/fixtures', icon: CalendarIcon },
      canManageCourse ? { name: 'Leagues & formats', href: '/admin/leagues', icon: TrophyIcon } : null,
      canManageCourse ? { name: 'Season results', href: '/admin/season-end', icon: TrophyIcon } : null,
      canManageCourse ? { name: 'CSV roster import', href: '/admin/roster-import', icon: UsersIcon } : null,
    ],
  },
  {
    group: 'Course & publishing',
    items: [
      canManageCourse ? { name: 'Course & tee boxes', href: '/admin/course', icon: FlagstickIcon } : null,
      canManageCourse ? { name: 'Clubhouse publishing', href: '/admin/publishing', icon: TvIcon } : null,
      { name: 'Cart sign printing', href: '/admin/cart-signs', icon: PrinterIcon },
      { name: 'Reports & analytics', href: '/admin/reports', icon: SparklesIcon },
    ],
  },
  {
    group: 'Administration',
    items: [
      canManageCourse ? { name: 'Treasury', href: '/admin/treasury', icon: DollarSignIcon } : null,
      canManageCourse ? { name: 'Operations settings', href: '/admin/settings', icon: SettingsIcon } : null,
      canManageCourse ? { name: 'Plans & billing', href: '/admin/billing', icon: ReceiptIcon } : null,
      canManageCourse ? { name: 'Archived leagues', href: '/admin/trash', icon: TrashIcon } : null,
    ],
  },
  ].map((group) => ({ ...group, items: group.items.filter(Boolean) })).filter((group) => group.items.length > 0);
};

export default function Sidebar({ leagueId = null, standingsToken = null, role = null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navGroups = getNavGroups(leagueId, standingsToken, role);

  function openCommandPalette() {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true }));
  }

  return (
    <aside className={`${styles.sidebar} admin-sidebar`}>
      <div className={styles.mobileBar}>
        <Link href="/admin" aria-label="Birvo admin home">
          <BrandMark />
        </Link>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span /><span /><span />
        </button>
      </div>

      {open && <button type="button" className={styles.backdrop} aria-label="Close menu" onClick={() => setOpen(false)} />}

      <div className={`${styles.panel} ${open ? styles.panelOpen : ''}`}>
        <div className={styles.panelTop}>
          <Link href="/admin" className={styles.brand} onClick={() => setOpen(false)}>
            <BrandMark />
            <span>Course operations</span>
          </Link>

          <button type="button" className={styles.searchButton} onClick={openCommandPalette}>
            <span><SearchIcon size={16} /> Search and navigate</span>
            <kbd>⌘K</kbd>
          </button>

          <nav className={styles.navigation} aria-label="Admin navigation">
            {navGroups.map((group) => (
              <section key={group.group} className={styles.navGroup}>
                <h2>{group.group}</h2>
                <div>
                  {group.items.map((item) => {
                    const active = pathname === item.href.split('?')[0];
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={active ? styles.activeLink : styles.navLink}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setOpen(false)}
                      >
                        <Icon size={18} />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </div>

        <div className={styles.workspaceStatus}>
          <span className={styles.statusDot} />
          <div>
            <strong>Birvo workspace</strong>
            <span>Operations dashboard ready</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
