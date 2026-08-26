import Image from 'next/image';

export default function BrandMark({ compact = false, theme = 'light', className = '' }) {
  const dark = theme === 'dark';

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? 0 : 10,
        color: dark ? '#f7f3e8' : '#12352c',
      }}
    >
      <Image
        src="/logo.png"
        alt=""
        width={compact ? 42 : 38}
        height={compact ? 42 : 38}
        priority
        style={{ borderRadius: compact ? 13 : 11 }}
      />
      {!compact && (
        <span style={{ fontSize: '1.32rem', fontWeight: 850, letterSpacing: '-0.045em' }}>
          Birvo
        </span>
      )}
    </span>
  );
}
