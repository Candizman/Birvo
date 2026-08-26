import { getAdminContext } from '../../lib/auth';
import Sidebar from './Sidebar';
import CommandPalette from '../../components/ui/CommandPalette';
import { ToastProvider } from '../../components/ui/ToastContext';
import { createPublicAccessToken, getPublicLinkVersion as getLocalPublicLinkVersion } from '../../lib/publicAccess';
import db from '../../lib/database';
import dataBackend from '../../lib/data/backend';
import publicAccessRepository from '../../lib/data/supabase/publicAccessRepository';
import { createClient } from '../../lib/supabase/server';
import { switchCourseAction, switchLeagueAction } from './actions';
import Alert from '../../components/ui/Alert';
import styles from './adminLayout.module.css';

export const dynamic = 'force-dynamic';

const { DATA_BACKENDS, resolveDataBackend } = dataBackend;

export default async function AdminLayout({ children }) {
  const context = await getAdminContext();
  let linkVersions = null;
  if (context?.courseId && context?.leagueId) {
    const activeDataBackend = resolveDataBackend();
    linkVersions = activeDataBackend === DATA_BACKENDS.SUPABASE
      ? await publicAccessRepository.getPublicLinkVersions(await createClient(), {
          courseId: context.courseId,
          leagueId: context.leagueId,
          purposes: ['standings', 'tv'],
        })
      : {
          standings: getLocalPublicLinkVersion(db, context.leagueId, 'standings'),
          tv: getLocalPublicLinkVersion(db, context.leagueId, 'tv'),
        };
  }
  const standingsToken = context?.leagueId ? createPublicAccessToken({ leagueId: context.leagueId, purpose: 'standings', version: linkVersions?.standings || 1 }) : null;
  const tvToken = context?.leagueId ? createPublicAccessToken({ leagueId: context.leagueId, purpose: 'tv', version: linkVersions?.tv || 1 }) : null;

  return (
    <ToastProvider>
      <div className={`${styles.layout} admin-layout`}>
        <Sidebar leagueId={context?.leagueId} standingsToken={standingsToken} tvToken={tvToken} role={context?.role} />
        <main className={`${styles.main} admin-main`}>
          <div className={styles.content}>
            {(context?.memberships?.length > 1 || context?.allLeagues?.length > 1) && (
              <section className={styles.workspaceBar} aria-label="Active workspace">
                {context.memberships.length > 1 && (
                  <form action={switchCourseAction} className={styles.switchForm}>
                    <label htmlFor="birvo-course-switcher">Course
                      <select id="birvo-course-switcher" name="courseId" defaultValue={String(context.courseId)}>
                        {context.memberships.map(membership => <option key={membership.course_id} value={membership.course_id}>{membership.course_name}</option>)}
                      </select>
                    </label>
                    <button type="submit" className="birvo-btn-secondary">Apply</button>
                  </form>
                )}
                {context.allLeagues.length > 1 && (
                  <form action={switchLeagueAction} className={styles.switchForm}>
                    <label htmlFor="birvo-league-switcher">League
                      <select id="birvo-league-switcher" name="leagueId" defaultValue={String(context.leagueId)}>
                        {context.allLeagues.map(league => <option key={league.id} value={league.id}>{league.name}</option>)}
                      </select>
                    </label>
                    <button type="submit" className="birvo-btn-secondary">Apply</button>
                  </form>
                )}
              </section>
            )}
            {context?.isLocalPreview && (
              <Alert variant="warning" className={styles.notice}>Local preview environment — the course and score data shown here are demo data.</Alert>
            )}
            {!context?.isLocalPreview && context?.leagueId && (!standingsToken || !tvToken) && (
              <Alert variant="danger" className={styles.notice}>Public league links are disabled. Define PUBLIC_LINK_SECRET in production.</Alert>
            )}
            {children}
          </div>
        </main>
        <CommandPalette leagueId={context?.leagueId} standingsToken={standingsToken} tvToken={tvToken} role={context?.role} />
      </div>
    </ToastProvider>
  );
}
