'use server'

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminContext } from '../../lib/auth';
import entityId from '../../lib/security/entityId';

const { normalizeEntityId } = entityId;

export async function switchCourseAction(formData) {
  const context = await getAdminContext();
  if (!context?.user) throw new Error('Authentication required.');
  const courseId = normalizeEntityId(formData.get('courseId'));
  const allowed = courseId && context.memberships?.some(item => String(item.course_id) === courseId);
  if (!allowed) throw new Error('You do not have access to that course.');

  const cookieStore = await cookies();
  cookieStore.set('birvo_course_id', String(courseId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.delete('birvo_league_id');
  redirect('/admin');
}

export async function switchLeagueAction(formData) {
  const context = await getAdminContext();
  if (!context?.user || !context.courseId) throw new Error('Authentication required.');

  const requestedLeagueId = String(formData.get('leagueId') || '').trim();
  const selectedLeague = context.allLeagues?.find(league => String(league.id) === requestedLeagueId);
  if (!selectedLeague) throw new Error('That league is not available in the active course.');

  const cookieStore = await cookies();
  cookieStore.set('birvo_league_id', String(selectedLeague.id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect('/admin');
}
