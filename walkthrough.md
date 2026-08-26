# Billing Draft Cutover

## Changes Made

1. **Service Abstractions**
   - Created `billingRepository.js` and added `getBillingDetailsAsync` to `billingService.js` to dispatch global read operations (`courses`, `billing_invoices`, `coupon_codes`, `leagues` counts, `teams` counts).
   - Disabled billing writes (`createCoupon`, `updateSubscriptionPlan`) by throwing an error when the backend is Supabase, as required by the "keep writes disabled pending Stripe decisions" constraint.
   - Refactored `app/admin/billing/page.js` to use the `getBillingDetailsAsync` service layer method instead of executing raw, unsecured SQLite queries.

## Validation Results
- `npm run test` local parity suite passes `109/109` confirming no SQLite regressions.
- The `Billing draft` P2 priority in `DAL_CUTOVER_MATRIX.md` is now complete.
- **100% of all P0, P1, and P2 tasks for the Supabase data access layer migration are now fully complete.**
