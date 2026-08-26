import Link from 'next/link';
import Card from './Card';
import ProgressBar from './ProgressBar';
import styles from './SetupChecklist.module.css';

export default function SetupChecklist({ progress }) {
  if (progress.completedCount === progress.steps.length) return null;
  const percentage = Math.round((progress.completedCount / progress.steps.length) * 100);
  return (
    <Card className={styles.checklist} aria-labelledby="setup-checklist-title">
      <div className={styles.header}>
        <div><span className={styles.eyebrow}>LAUNCH CHECKLIST</span><h2 id="setup-checklist-title">Finish configuring your course</h2><p>{progress.completedCount} of {progress.steps.length} readiness checks complete.</p></div>
        <strong className={styles.percentage}>{percentage}%</strong>
      </div>
      <div className={styles.progress}><ProgressBar value={percentage} label="Course setup completion" /></div>
      <div className={styles.steps}>
        {progress.steps.map(step => (
          <Link key={step.key} href={step.href} className={`${styles.step} ${step.complete ? styles.stepComplete : ''}`.trim()}>
            <div className={styles.stepTitle}><span aria-hidden="true" className={styles.stepStatus}>{step.complete ? '✓' : '○'}</span>{step.label}</div>
            <div className={styles.stepDescription}>{step.description}</div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
