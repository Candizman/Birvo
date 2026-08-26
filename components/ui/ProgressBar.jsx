import styles from './primitives.module.css';

export default function ProgressBar({ value, max = 100, label }) {
  const safeMax = Number.isFinite(Number(max)) && Number(max) > 0 ? Number(max) : 100;
  const safeValue = Math.min(safeMax, Math.max(0, Number(value) || 0));
  const percentage = Math.round((safeValue / safeMax) * 100);

  return (
    <div
      className={styles.progressTrack}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={`${percentage}%`}
    >
      <div className={styles.progressValue} style={{ width: `${percentage}%` }} />
    </div>
  );
}
