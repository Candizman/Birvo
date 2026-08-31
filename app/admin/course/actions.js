'use server'

import {
  requireAdminRole,
  COURSE_MANAGEMENT_ROLES,
  SCORING_OPERATION_ROLES,
} from '../../../lib/auth';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '../../../lib/supabase/admin';
import { createClient } from '../../../lib/supabase/server';
import membershipService from '../../../lib/services/membershipService';
import persistentRateLimit from '../../../lib/data/persistentRateLimit';
import operationsRepository from '../../../lib/data/supabase/operationsRepository';
import entityId from '../../../lib/security/entityId';

const { normalizeEntityId } = entityId;

function requireText(value, label, { min = 1, max = 160 } = {}) {
  const normalized = String(value || '').trim();
  if (normalized.length < min || normalized.length > max) throw new Error(`${label} must be between ${min} and ${max} characters.`);
  return normalized;
}

function optionalText(value, max) {
  const normalized = String(value || '').trim();
  if (normalized.length > max) throw new Error(`This field cannot exceed ${max} characters.`);
  return normalized;
}

function numberInRange(value, label, min, max, { integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${label} must be ${integer ? 'a whole number ' : ''}between ${min} and ${max}.`);
  }
  return parsed;
}

export async function initializeCourseLayoutAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  // A nine-hole course that gets an eighteen-hole layout is scored against par 72
  // all season, which drives every handicap to zero without complaining.
  const holes = Number(formData?.get('holes')) === 9 ? 9 : 18;

  await operationsRepository.initializeCourseLayout(await createClient(), {
    courseId: context.courseId, holes,
  });
  revalidatePath('/admin/course');
  revalidatePath('/admin');
  return { success: true };
}

export async function saveCourseProfile(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const name = requireText(formData.get('name'), 'Course name', { min: 2, max: 160 });
  const address = optionalText(formData.get('address'), 240);
  const city = optionalText(formData.get('city'), 80);
  const contact_email = optionalText(formData.get('contact_email'), 254).toLowerCase();
  const contact_phone = optionalText(formData.get('contact_phone'), 40);
  const primary_color = String(formData.get('primary_color') || '#1D7A5F').trim();
  const local_rules = optionalText(formData.get('local_rules'), 5000);
  if (contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) throw new Error('Enter a valid contact email address.');
  if (!/^#[0-9A-Fa-f]{6}$/.test(primary_color)) throw new Error('Theme color must be a six-digit hex value.');

  await operationsRepository.updateCourseProfile(await createClient(), {
    courseId: context.courseId,
    name,
    address,
    city,
    contactEmail: contact_email,
    contactPhone: contact_phone,
    primaryColor: primary_color,
    localRules: local_rules,
  });

  revalidatePath('/admin/course');
  revalidatePath('/admin');
  return { success: true };
}

export async function saveHoles(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const holesData = [];
  for (let h = 1; h <= 18; h++) {
    const par = numberInRange(formData.get(`par_${h}`), `Hole ${h} par`, 3, 6, { integer: true });
    const strokeIndex = numberInRange(formData.get(`stroke_index_${h}`), `Hole ${h} stroke index`, 1, 18, { integer: true });
    const pinPosition = formData.get(`pin_${h}`) || 'center';
    const isMaintenance = formData.get(`maintenance_${h}`) === 'on';
    if (!['front', 'center', 'back'].includes(pinPosition)) throw new Error(`Hole ${h} has an invalid pin position.`);
    holesData.push({
      hole_number: h,
      par,
      stroke_index: strokeIndex,
      pin_position: pinPosition,
      is_under_maintenance: isMaintenance,
    });
  }
  if (new Set(holesData.map(hole => hole.stroke_index)).size !== 18) throw new Error('Each stroke index from 1 through 18 must be used exactly once.');

  await operationsRepository.saveCourseHoles(await createClient(), { courseId: context.courseId, holes: holesData });

  revalidatePath('/admin/course');
  return { success: true };
}

export async function saveTeeBoxAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const id = formData.get('id') ? normalizeEntityId(formData.get('id')) : null;
  const name = requireText(formData.get('name'), 'Tee box name', { min: 1, max: 100 });
  const color_hex = String(formData.get('color_hex') || '#FFFFFF').trim();
  const gender = String(formData.get('gender') || 'all');
  const course_rating = numberInRange(formData.get('course_rating'), 'Course rating', 40, 90);
  const slope_rating = numberInRange(formData.get('slope_rating'), 'Slope rating', 55, 155, { integer: true });
  const total_yards = numberInRange(formData.get('total_yards'), 'Total yards', 500, 10000, { integer: true });
  if (!/^#[0-9A-Fa-f]{6}$/.test(color_hex)) throw new Error('Tee color must be a six-digit hex value.');
  if (!['all', 'men', 'women', 'senior', 'junior'].includes(gender)) throw new Error('Select a valid tee category.');

  await operationsRepository.upsertCourseTeeBox(await createClient(), {
    courseId: context.courseId,
    teeId: id,
    name,
    colorHex: color_hex,
    gender,
    courseRating: course_rating,
    slopeRating: slope_rating,
    totalYards: total_yards,
  });

  revalidatePath('/admin/course');
  return { success: true };
}

export async function deleteTeeBoxAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const teeId = normalizeEntityId(formData.get('teeId'));
  await operationsRepository.deleteCourseTeeBox(await createClient(), { courseId: context.courseId, teeId });

  revalidatePath('/admin/course');
  return { success: true };
}

export async function generateTeeTimesAction(formData) {
  const context = await requireAdminRole(SCORING_OPERATION_ROLES);
  if (!context.leagueId) throw new Error('No active league is available.');

  const startTime = String(formData.get('startTime') || '09:00');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) throw new Error('Enter a valid starting time.');

  await operationsRepository.generateShotgunTeeTimes(await createClient(), {
    courseId: context.courseId,
    leagueId: context.leagueId,
    weekNumber: context.currentWeek,
    startTime,
  });

  revalidatePath('/admin/course');
  return { success: true };
}

export async function inviteStaffAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    const email = membershipService.normalizeEmail(formData.get('email'));
    const role = membershipService.validateInvitableRole(formData.get('role'));
    const admin = createAdminClient();
    if (!admin) return { error: 'Staff email delivery is not configured. Add SUPABASE_SECRET_KEY to the server environment.' };

    const rateLimit = await persistentRateLimit.checkDataRateLimit({
      adminClient: admin,
      scope: `staff_invite:${context.courseId}`,
      subject: email,
      maxRequests: 3,
      windowMs: 60 * 60 * 1000,
    });
    if (!rateLimit.allowed) return { error: `Too many invitation attempts. Try again in ${rateLimit.retryAfterSeconds} seconds.` };

    const invitationId = await operationsRepository.createCourseInvitation(await createClient(), {
      courseId: context.courseId, email, role,
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${baseUrl}/auth/confirm?next=/account/update-password`,
      data: { birvo_invitation_id: invitationId },
    });
    if (error) {
      await operationsRepository.markCourseInvitationDelivery(admin, {
        invitationId, error: error.message,
      });
      return { error: 'The email provider rejected the invitation. No staff access was granted.' };
    }
    await operationsRepository.markCourseInvitationDelivery(admin, {
      invitationId, authUserId: data.user?.id || null,
    });
    revalidatePath('/admin/course');
    return { success: `Invitation sent to ${email}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to send the invitation.' };
  }
}

export async function updateStaffRoleAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    await operationsRepository.updateCourseMemberRole(await createClient(), {
      courseId: context.courseId,
      membershipId: normalizeEntityId(formData.get('membershipId')),
      role: formData.get('role'),
    });
    revalidatePath('/admin/course');
    return { success: 'Staff role updated.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to update the role.' };
  }
}

export async function removeStaffAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    await operationsRepository.removeCourseMember(await createClient(), {
      courseId: context.courseId,
      membershipId: normalizeEntityId(formData.get('membershipId')),
    });
    revalidatePath('/admin/course');
    return { success: 'Staff access removed.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to remove access.' };
  }
}

export async function revokeStaffInvitationAction(previousState, formData) {
  try {
    const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);
    await operationsRepository.revokeCourseInvitation(await createClient(), {
      courseId: context.courseId,
      invitationId: normalizeEntityId(formData.get('invitationId')),
    });
    revalidatePath('/admin/course');
    return { success: 'Invitation revoked.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to revoke the invitation.' };
  }
}
