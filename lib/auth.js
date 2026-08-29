import { createClient } from './supabase/server';
import { verifyPlayerSessionToken } from './playerSession';
import adminRoles from './security/adminRoles';
import supabaseWorkspaceRepository from './data/supabase/workspaceRepository';
import workspaceSelection from './services/workspaceSelectionService';
import { cookies } from 'next/headers';

export const {
  COURSE_MANAGEMENT_ROLES,
  SCORING_OPERATION_ROLES,
  hasAdminRole,
} = adminRoles;

const { selectLeagueForWorkspace } = workspaceSelection;
const { listActiveLeagues, listUserMemberships } = supabaseWorkspaceRepository;

/**
 * Returns the current administrator context.
 *
 * Returned object:
 *   { user, courseId, leagueId, currentWeek, role, allLeagues, memberships }
 *
 * - role: 'superadmin' | 'course_owner' | 'course_admin' | 'assistant_admin' | 'scorekeeper' | null
 * - allLeagues: all active leagues for the selected course (multi-league support)
 * - leagueId: the validated league selection for the active course
 *
 * Every read here runs through the request-scoped Supabase client, so row-level
 * security applies: a user only ever sees the courses they are a member of.
 */
export async function getAdminContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null; // Not signed in.
  }

  const memberships = await listUserMemberships(supabase, user.id);

  if (memberships.length === 0) {
    return { user, courseId: null, leagueId: null, currentWeek: 1, role: null, allLeagues: [], memberships: [] };
  }

  const cookieStore = await cookies();
  const selectedCourseId = String(cookieStore.get('birvo_course_id')?.value || '').trim();
  const selectedMembership = memberships.find(item => String(item.course_id) === selectedCourseId) || memberships[0];
  const requestedLeagueId = cookieStore.get('birvo_league_id')?.value;

  const allLeagues = await listActiveLeagues(supabase, selectedMembership.course_id);
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
