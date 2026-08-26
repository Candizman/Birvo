'use server'

import { requireAdminRole } from '../../lib/auth';

export async function toggleCourseStatus(formData) {
  await requireAdminRole(['superadmin', 'super-admin'], { requireCourse: false });
  void formData;
  return {
    error: 'Course suspension is not enabled yet. Account lifecycle status must remain separate from Stripe payment status.',
  };
}
