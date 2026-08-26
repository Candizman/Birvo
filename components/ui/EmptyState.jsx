import Link from 'next/link';
import { FlagstickIcon } from '../icons/GolfIcons';

export default function EmptyState({
  eyebrow = 'Getting started',
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  steps = [],
}) {
  return (
    <section style={{
      maxWidth: '820px',
      margin: '5vh auto 0',
      padding: 'clamp(2rem, 6vw, 4.5rem)',
      border: '1px solid var(--color-border)',
      borderRadius: '22px',
      background: 'linear-gradient(145deg, #ffffff, #f3f7f4)',
      boxShadow: 'var(--card-shadow-lg)',
    }}>
      <span style={{
        width: '48px',
        height: '48px',
        display: 'grid',
        placeItems: 'center',
        borderRadius: '14px',
        color: 'var(--color-primary)',
        background: 'var(--color-primary-light)',
      }}>
        <FlagstickIcon size={24} />
      </span>
      <p style={{ margin: '22px 0 8px', color: 'var(--color-primary)', fontSize: '0.72rem', fontWeight: 850, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {eyebrow}
      </p>
      <h1 style={{ margin: 0, maxWidth: '680px', color: 'var(--color-text-main)', fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 5vw, 3.3rem)', lineHeight: 1.06, letterSpacing: '-0.045em' }}>
        {title}
      </h1>
      <p style={{ maxWidth: '650px', margin: '18px 0 0', color: 'var(--color-text-muted)', fontSize: '1rem', lineHeight: 1.7 }}>
        {description}
      </p>

      {steps.length > 0 && (
        <ol style={{ margin: '30px 0 0', padding: 0, display: 'grid', gap: '10px', listStyle: 'none' }}>
          {steps.map((step, index) => (
            <li key={step} style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--color-border)', borderRadius: '11px', color: '#38554c', background: 'rgba(255,255,255,0.76)', fontSize: '0.88rem', fontWeight: 700 }}>
              <span style={{ width: '25px', height: '25px', display: 'grid', placeItems: 'center', borderRadius: '8px', color: '#ffffff', background: 'var(--color-primary)', fontSize: '0.68rem' }}>{index + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      )}

      <div style={{ marginTop: '30px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        {primaryHref && primaryLabel && <Link className="birvo-btn-primary" href={primaryHref}>{primaryLabel}</Link>}
        {secondaryHref && secondaryLabel && <Link className="birvo-btn-secondary" href={secondaryHref}>{secondaryLabel}</Link>}
      </div>
    </section>
  );
}
