const billingRepository = require('../data/supabase/billingRepository');

const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 49,
    maxLeagues: 1,
    maxTeams: 30,
    features: ['1 active league', 'Up to 30 teams', 'Handicap and points calculations', 'Mobile-friendly score entry']
  },
  pro_club: {
    id: 'pro_club',
    name: 'Club',
    priceMonthly: 149,
    maxLeagues: 5,
    maxTeams: 150,
    features: ['5 active leagues', 'Up to 150 teams', 'Clubhouse TV display', 'Multiple tournament formats', 'CSV and PDF reports']
  },
  enterprise: {
    id: 'enterprise',
    name: 'Multi-Course',
    priceMonthly: 299,
    maxLeagues: 999,
    maxTeams: 9999,
    features: ['Unlimited leagues and courses', 'Unlimited teams', 'Custom branding and domain', 'Priority support', 'Multi-facility management']
  }
};

const BILLING_WRITES_DISABLED =
  'Subscription and promo-code changes are not available yet. Billing is read-only until payment handling ships.';

async function getBillingDetails(client, courseId) {
  const rawDetails = await billingRepository.getBillingDetails(client, courseId);
  if (!rawDetails || !rawDetails.course) return null;

  const { course, invoices, coupons, leaguesCount, teamsCount } = rawDetails;

  const currentPlanKey = course.subscription_plan || 'starter';
  const planInfo = PLANS[currentPlanKey] || PLANS.starter;

  return {
    course,
    currentPlan: planInfo,
    allPlans: Object.values(PLANS),
    invoices,
    coupons,
    usage: {
      leaguesCount,
      maxLeagues: planInfo.maxLeagues,
      teamsCount,
      maxTeams: planInfo.maxTeams
    }
  };
}

// Writes are intentionally unimplemented. The PostgreSQL schema grants only SELECT
// on billing_invoices and coupon_codes, and exposes no write RPC for either, so
// there is no path that could persist a plan change or a new promo code. These
// throw rather than silently doing nothing.
function createCoupon() {
  throw new Error(BILLING_WRITES_DISABLED);
}

function updateSubscriptionPlan() {
  throw new Error(BILLING_WRITES_DISABLED);
}

module.exports = {
  PLANS,
  BILLING_WRITES_DISABLED,
  getBillingDetails,
  createCoupon,
  updateSubscriptionPlan
};
