import { createClient } from './supabase/server';
import db from './database';
import { verifyPlayerSessionToken } from './playerSession';
import adminRoles from './security/adminRoles';
import dataBackend from './data/backend';
import supabaseWorkspaceRepository from './data/supabase/workspaceRepository';
import workspaceSelection from './services/workspaceSelectionService';
import { cookies } from 'next/headers';

export const {
  COURSE_MANAGEMENT_ROLES,
  SCORING_OPERATION_ROLES,
  hasAdminRole,
} = adminRoles;

const { selectLeagueForWorkspace } = workspaceSelection;
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const { listActiveLeagues, listUserMemberships } = supabaseWorkspaceRepository;

/**
 * Returns the current administrator context.
 *
 * Returned object:
 *   { user, courseId, leagueId, currentWeek, role, allLeagues }
 *
 * - role: 'superadmin' | 'course_owner' | 'course_admin' | 'assistant_admin' | 'scorekeeper' | null
 * - allLeagues: all active leagues for the course (multi-league support)
 * - leagueId: the validated league selection for the active course
 */
export async function getAdminContext() {
  const activeDataBackend = resolveDataBackend();

  // Local preview mode is intentionally limited to development. Production
  // never receives an implicit admin session when Supabase is not configured.
  if (activeDataBackend === DATA_BACKENDS.SQLITE && !process.env.NEXT_PUBLIC_SUPABASE_URL) {

    const cookieStore = await cookies();
    const requestedCourseId = Number(cookieStore.get('birvo_course_id')?.value);
    const requestedLeagueId = cookieStore.get('birvo_league_id')?.value;
    const course = db
      .prepare('SELECT id FROM courses ORDER BY created_at ASC, id ASC')
      .all()
      .find(item => item.id === requestedCourseId) || db
      .prepare('SELECT id FROM courses ORDER BY created_at ASC, id ASC LIMIT 1')
      .get();
    const courseId = course?.id ?? null;

    if (!courseId) {
      return {
        user: { id: 'local-preview-admin', email: 'admin@birvo.local' },
        courseId: null,
        leagueId: null,
        currentWeek: 1,
        role: 'course_admin',
        allLeagues: [],
        memberships: [],
        isLocalPreview: true,
      };
    }

    const allLeagues = db
      .prepare(
        "SELECT id, name, current_week FROM leagues WHERE course_id = ? AND status = 'active' ORDER BY created_at ASC"
      )
      .all(courseId);

    const selectedLeague = selectLeagueForWorkspace(allLeagues, requestedLeagueId);

    return {
      user: { id: 'local-preview-admin', email: 'admin@birvo.local' },
      courseId,
      leagueId: selectedLeague ? selectedLeague.id : null,
      currentWeek: selectedLeague ? selectedLeague.current_week : 1,
      role: 'course_admin',
      allLeagues,
      memberships: db.prepare('SELECT id AS course_id, name AS course_name FROM courses ORDER BY name').all(),
      isLocalPreview: true,
    };
  }

  // ─── PRODUCTION: REAL SUPABASE AUTH ─────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null; // Not signed in.
  }

  const memberships = activeDataBackend === DATA_BACKENDS.SUPABASE
    ? await listUserMemberships(supabase, user.id)
    : db.prepare(`
        SELECT m.course_id, m.role, c.name AS course_name
        FROM course_memberships m
        JOIN courses c ON c.id = m.course_id
        WHERE m.user_id = ? AND m.status = 'active'
        ORDER BY c.name ASC, m.created_at ASC
      `).all(user.id);

  // Read-only compatibility for installations that have not yet run v15.
  if (activeDataBackend === DATA_BACKENDS.SQLITE && memberships.length === 0) {
    const legacy = db.prepare(`
      SELECT u.course_id, u.role, c.name AS course_name
      FROM users u LEFT JOIN courses c ON c.id = u.course_id
      WHERE u.id = ? AND u.course_id IS NOT NULL
    `).get(user.id);
    if (legacy) memberships.push(legacy);
  }

  if (memberships.length === 0) {
    return { user, courseId: null, leagueId: null, currentWeek: 1, role: null, allLeagues: [], memberships: [] };
  }

  const cookieStore = await cookies();
  const selectedCourseId = String(cookieStore.get('birvo_course_id')?.value || '').trim();
  const selectedMembership = memberships.find(item => String(item.course_id) === selectedCourseId) || memberships[0];
  const requestedLeagueId = cookieStore.get('birvo_league_id')?.value;

  // Load every active league for the course (multi-league support — Plan §3.1).
  const allLeagues = activeDataBackend === DATA_BACKENDS.SUPABASE
    ? await listActiveLeagues(supabase, selectedMembership.course_id)
    : db
        .prepare(
          "SELECT id, name, current_week FROM leagues WHERE course_id = ? AND status = 'active' ORDER BY created_at ASC"
        )
        .all(selectedMembership.course_id);

  const selectedLeague = selectLeagueForWorkspace(allLeagues, requestedLeagueId);

  return {
    user,
    courseId: selectedMembership.course_id,
    leagueId: selectedLeague ? selectedLeague.id : null,
    currentWeek: selectedLeague ? selectedLeague.current_week : 1,
    role: selectedMembership.role || null,
    allLeagues,
    memberships,
    isLocalPreview: false,
  };
}

export async function requireAdminRole(allowedRoles, { requireCourse = true } = {}) {
  const context = await getAdminContext();
  if (!context || !hasAdminRole(context.role, allowedRoles) || (requireCourse && !context.courseId)) {
    throw new Error('Unauthorized operation');
  }
  return context;
}

// ─── PLAYER SESSION ────────────────────────────────────────────────────────────
export async function getPlayerSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get('player_session');
  if (!session || !session.value) return null;
  return verifyPlayerSessionToken(session.value);
}
