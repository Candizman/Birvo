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

const dataBackend = require('../data/backend');
const { DATA_BACKENDS, resolveDataBackend } = dataBackend;
const billingRepository = require('../data/supabase/billingRepository');

function getBillingDetails(db, courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return null;

  const currentPlanKey = course.subscription_plan || 'starter';
  const planInfo = PLANS[currentPlanKey] || PLANS.starter;

  const invoices = db.prepare('SELECT * FROM billing_invoices WHERE course_id = ? ORDER BY created_at DESC').all(courseId);
  const coupons = db.prepare('SELECT * FROM coupon_codes WHERE course_id = ? ORDER BY created_at DESC').all(courseId);

  // Count active leagues and teams
  const leaguesCount = db.prepare("SELECT COUNT(*) as count FROM leagues WHERE course_id = ? AND status != 'trashed'").get(courseId).count;
  const teamsCount = db.prepare(`
    SELECT COUNT(*) as count FROM teams t
    JOIN leagues l ON t.league_id = l.id
    WHERE l.course_id = ? AND t.status = 'active'
  `).get(courseId).count;

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

async function getBillingDetailsAsync(db, client, courseId) {
  let rawDetails;
  
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    rawDetails = await billingRepository.getBillingDetails(client, courseId);
  } else {
    // Rely on the synchronous sqlite version for data
    const sqliteDetails = getBillingDetails(db, courseId);
    if (!sqliteDetails) return null;
    rawDetails = {
      course: sqliteDetails.course,
      invoices: sqliteDetails.invoices,
      coupons: sqliteDetails.coupons,
      leaguesCount: sqliteDetails.usage.leaguesCount,
      teamsCount: sqliteDetails.usage.teamsCount
    };
  }

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

function applyCoupon(db, courseId, code, originalAmount) {
  const coupon = db.prepare('SELECT * FROM coupon_codes WHERE course_id = ? AND code = ?').get(courseId, code);
  if (!coupon) {
    return { valid: false, error: 'Invalid promo code.' };
  }

  if (coupon.used_count >= coupon.max_uses) {
    return { valid: false, error: 'This promo code has reached its maximum usage limit.' };
  }

  let discountedAmount = originalAmount;
  let savings = 0;

  if (coupon.discount_type === 'percent') {
    savings = (originalAmount * coupon.discount_value) / 100;
    discountedAmount = Math.max(0, originalAmount - savings);
  } else {
    savings = coupon.discount_value;
    discountedAmount = Math.max(0, originalAmount - savings);
  }

  return {
    valid: true,
    code: coupon.code,
    originalAmount,
    savings: Number(savings.toFixed(2)),
    discountedAmount: Number(discountedAmount.toFixed(2))
  };
}

function createCoupon(db, courseId, { code, discountType = 'percent', discountValue = 20, maxUses = 50 }) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    throw new Error('Billing writes are disabled during the database cutover phase pending Stripe decisions.');
  }
  return db.prepare(`
    INSERT INTO coupon_codes (course_id, code, discount_type, discount_value, max_uses)
    VALUES (?, ?, ?, ?, ?)
  `).run(courseId, code.toUpperCase().trim(), discountType, discountValue, maxUses);
}

function updateSubscriptionPlan(db, courseId, planKey) {
  if (resolveDataBackend() === DATA_BACKENDS.SUPABASE) {
    throw new Error('Billing writes are disabled during the database cutover phase pending Stripe decisions.');
  }
  if (!PLANS[planKey]) throw new Error('Invalid plan');

  return db.prepare(`
    UPDATE courses SET
      subscription_plan = ?
    WHERE id = ?
  `).run(planKey, courseId);
}

module.exports = {
  PLANS,
  getBillingDetails,
  getBillingDetailsAsync,
  applyCoupon,
  createCoupon,
  updateSubscriptionPlan
};
