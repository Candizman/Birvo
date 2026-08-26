const { requireUuid } = require('./workspaceRepository');
const { unwrapSupabaseResult } = require('./errors');

async function getBillingDetails(client, courseId) {
  const normCourseId = requireUuid(courseId, 'billing scope');

  const courseRes = await client.from('courses').select('*').eq('id', normCourseId).single();
  const course = unwrapSupabaseResult(courseRes, 'read course billing details');
  
  if (!course) return null;

  const invoicesRes = await client.from('billing_invoices').select('*').eq('course_id', normCourseId).order('created_at', { ascending: false });
  const invoices = unwrapSupabaseResult(invoicesRes, 'read billing invoices') || [];

  const couponsRes = await client.from('coupon_codes').select('*').eq('course_id', normCourseId).order('created_at', { ascending: false });
  const coupons = unwrapSupabaseResult(couponsRes, 'read coupon codes') || [];

  const leaguesRes = await client.from('leagues').select('id').eq('course_id', normCourseId).neq('status', 'trashed');
  const leagues = unwrapSupabaseResult(leaguesRes, 'read billing leagues') || [];
  
  const leaguesCount = leagues.length;
  
  let teamsCount = 0;
  if (leaguesCount > 0) {
    const leagueIds = leagues.map(l => l.id);
    const teamsRes = await client.from('teams').select('id').in('league_id', leagueIds).eq('status', 'active');
    const teams = unwrapSupabaseResult(teamsRes, 'read billing teams') || [];
    teamsCount = teams.length;
  }

  return {
    course,
    invoices,
    coupons,
    leaguesCount,
    teamsCount
  };
}

module.exports = {
  getBillingDetails
};
