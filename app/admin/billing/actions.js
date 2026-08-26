'use server'

import db from '../../../lib/database';
import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { updateSubscriptionPlan, createCoupon } from '../../../lib/services/billingService';
import { revalidatePath } from 'next/cache';

export async function changePlanAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const planKey = formData.get('planKey');
  updateSubscriptionPlan(db, context.courseId, planKey);

  revalidatePath('/admin/billing');
  revalidatePath('/admin');
  return { success: true };
}

export async function createCouponAction(formData) {
  const context = await requireAdminRole(COURSE_MANAGEMENT_ROLES);

  const code = formData.get('code')?.trim();
  const discountType = formData.get('discountType') || 'percent';
  const discountValue = parseFloat(formData.get('discountValue')) || 20;
  const maxUses = parseInt(formData.get('maxUses')) || 50;

  if (!code) return { error: 'Promo code is required.' };

  createCoupon(db, context.courseId, { code, discountType, discountValue, maxUses });

  revalidatePath('/admin/billing');
  return { success: true };
}
