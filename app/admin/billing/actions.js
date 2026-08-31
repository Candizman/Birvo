'use server'

import { requireAdminRole, COURSE_MANAGEMENT_ROLES } from '../../../lib/auth';
import { BILLING_WRITES_DISABLED } from '../../../lib/services/billingService';

// Billing is read-only. The PostgreSQL schema grants only SELECT on
// billing_invoices and coupon_codes and exposes no write RPC, so neither action
// has a path that could persist anything. They report that plainly instead of
// appearing to succeed.

export async function changePlanAction() {
  await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  return { error: BILLING_WRITES_DISABLED };
}

export async function createCouponAction() {
  await requireAdminRole(COURSE_MANAGEMENT_ROLES);
  return { error: BILLING_WRITES_DISABLED };
}
