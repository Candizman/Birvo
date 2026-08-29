import { getAdminContext, COURSE_MANAGEMENT_ROLES, hasAdminRole } from '../../../lib/auth';
import { getBillingDetails } from '../../../lib/services/billingService';
import { createClient } from '../../../lib/supabase/server';
import EmptyState from '../../../components/ui/EmptyState';
import { CheckIcon, ReceiptIcon, ShieldCheckIcon } from '../../../components/icons/GolfIcons';

export default async function BillingPage() {
  const context = await getAdminContext();

  if (!context) {
    return (
      <EmptyState
        eyebrow="Secure area"
        title="Admin session required"
        description="Sign in to view subscription and billing settings."
        primaryHref="/login"
        primaryLabel="Sign in"
      />
    );
  }

  if (!hasAdminRole(context.role, COURSE_MANAGEMENT_ROLES)) {
    return (
      <EmptyState
        eyebrow="Restricted area"
        title="Course manager access required"
        description="Subscription and billing information is available only to course owners and managers."
        primaryHref="/admin"
        primaryLabel="Back to overview"
      />
    );
  }

  if (!context.courseId) {
    return (
      <EmptyState
        title="Set up the course workspace first"
        description="A subscription belongs to a course or facility account. Complete course setup before configuring billing."
        primaryHref="/admin"
        primaryLabel="Back to setup"
      />
    );
  }

  const billing = await getBillingDetails(await createClient(), context.courseId);
  if (!billing) {
    return (
      <EmptyState
        title="Billing information not found"
        description="No valid course record was found for this workspace. Contact your account administrator."
        primaryHref="/admin"
        primaryLabel="Back to dashboard"
      />
    );
  }

  const { course, currentPlan, allPlans, usage } = billing;

  return (
    <div className="container" style={{ padding: 0, maxWidth: '1120px' }}>
      <header style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', border: '1px solid var(--color-primary-border)', borderRadius: '999px', color: 'var(--color-primary)', background: 'var(--color-primary-light)', fontSize: '0.76rem', fontWeight: 850, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <ReceiptIcon size={15} color="currentColor" /> Subscription draft
        </div>
        <h1 style={{ margin: '12px 0 6px', color: 'var(--color-text-main)', fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', letterSpacing: '-0.04em' }}>
          Plans and usage limits
        </h1>
        <p style={{ maxWidth: '720px', margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
          Review the proposed subscription structure and current usage for {course.name}. This screen does not accept payments yet.
        </p>
      </header>

      <section style={{ marginBottom: '2rem', padding: '1.25rem 1.4rem', display: 'flex', alignItems: 'flex-start', gap: '12px', border: '1px solid #f0d5a9', borderRadius: '15px', color: '#6f4611', background: '#fff8eb' }}>
        <ShieldCheckIcon size={22} color="#a56514" />
        <div>
          <strong style={{ display: 'block', marginBottom: '4px' }}>Payment infrastructure is not connected yet</strong>
          <span style={{ fontSize: '0.9rem', lineHeight: 1.55 }}>
            Stripe account setup, webhook verification, tax and currency decisions, and cancellation and refund flows must be completed before live billing. The plans below are product-planning drafts.
          </span>
        </div>
      </section>

      <section className="birvo-card" style={{ padding: '1.6rem', marginBottom: '2.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '0.76rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Draft workspace plan</p>
            <h2 style={{ margin: '7px 0 0', color: 'var(--color-text-main)', fontSize: '1.35rem' }}>{currentPlan.name}</h2>
          </div>
          <span style={{ alignSelf: 'flex-start', padding: '7px 11px', borderRadius: '999px', color: '#6b4a14', background: '#fff5df', fontSize: '0.76rem', fontWeight: 800 }}>Not a live subscription</span>
        </div>

        <div style={{ marginTop: '1.4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
          <UsageMeter label="League usage" value={usage.leaguesCount} max={usage.maxLeagues} />
          <UsageMeter label="Team capacity" value={usage.teamsCount} max={usage.maxTeams} />
        </div>
      </section>

      <div style={{ marginBottom: '1.15rem' }}>
        <h2 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '1.25rem' }}>Plans under consideration</h2>
        <p style={{ margin: '5px 0 0', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Pricing and contract terms will be finalized before payment integration.</p>
      </div>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        {allPlans.map((plan) => {
          const selected = plan.id === currentPlan.id;
          return (
            <article key={plan.id} className="birvo-card" style={{ padding: '1.4rem', borderColor: selected ? 'var(--color-primary)' : 'var(--color-border)', background: selected ? 'linear-gradient(145deg, #ffffff, #eef7f1)' : '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <h3 style={{ margin: 0, color: 'var(--color-text-main)', fontSize: '1.08rem' }}>{plan.name}</h3>
                {selected && <span style={{ color: 'var(--color-primary)', fontSize: '0.7rem', fontWeight: 850, textTransform: 'uppercase' }}>Selected draft</span>}
              </div>
              <ul style={{ margin: '1.1rem 0 0', padding: 0, display: 'grid', gap: '9px', listStyle: 'none' }}>
                {plan.features.map((feature) => (
                  <li key={feature} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', color: 'var(--color-text-muted)', fontSize: '0.85rem', lineHeight: 1.45 }}>
                    <CheckIcon size={16} color="var(--color-primary)" /> {feature}
                  </li>
                ))}
              </ul>
              <button type="button" disabled style={{ width: '100%', marginTop: '1.3rem', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '9px', color: '#7c8c86', background: '#f2f5f3', fontWeight: 750, cursor: 'not-allowed' }}>
                Payment link pending
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function UsageMeter({ label, value, max }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--color-text-muted)', fontSize: '0.84rem' }}>
        <span>{label}</span>
        <strong style={{ color: 'var(--color-text-main)' }}>{value} / {max >= 999 ? 'Unlimited' : max}</strong>
      </div>
      <div style={{ height: '8px', overflow: 'hidden', borderRadius: '999px', background: '#e6ece8' }}>
        <div style={{ width: `${percent}%`, height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg, var(--color-primary), #58a36f)' }} />
      </div>
    </div>
  );
}
