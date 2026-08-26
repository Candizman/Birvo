'use client';

import { useActionState } from 'react';
import { completeOnboarding } from './actions';
import styles from './onboarding.module.css';

const initialState = { error: null };

export default function OnboardingForm({ accountEmail, previewOnly = false }) {
  const [state, formAction, pending] = useActionState(completeOnboarding, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <section className={styles.section} aria-labelledby="course-details-heading">
        <div className={styles.sectionNumber}>01</div>
        <div className={styles.sectionContent}>
          <div className={styles.sectionHeading}>
            <h2 id="course-details-heading">Course details</h2>
            <p>Create the private workspace that will own your leagues, teams, and staff.</p>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.fullWidth}>
              <span>Golf course name</span>
              <input name="courseName" required minLength="2" maxLength="120" autoComplete="organization" placeholder="e.g. Hidden Valley Golf Club" />
            </label>
            <label className={styles.fullWidth}>
              <span>Street address <small>Optional</small></span>
              <input name="address" maxLength="180" autoComplete="street-address" placeholder="123 Fairway Drive" />
            </label>
            <label>
              <span>City</span>
              <input name="city" required minLength="2" maxLength="80" autoComplete="address-level2" placeholder="Austin" />
            </label>
            <label>
              <span>State</span>
              <input name="state" required minLength="2" maxLength="2" pattern="[A-Za-z]{2}" autoComplete="address-level1" placeholder="TX" className={styles.uppercaseInput} />
            </label>
            <label>
              <span>ZIP code <small>Optional</small></span>
              <input name="postalCode" inputMode="numeric" pattern="[0-9]{5}(-[0-9]{4})?" autoComplete="postal-code" placeholder="78701" />
            </label>
            <label>
              <span>Time zone</span>
              <select name="timezone" required defaultValue="America/New_York">
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Phoenix">Arizona Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="America/Anchorage">Alaska Time</option>
                <option value="Pacific/Honolulu">Hawaii Time</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="league-details-heading">
        <div className={styles.sectionNumber}>02</div>
        <div className={styles.sectionContent}>
          <div className={styles.sectionHeading}>
            <h2 id="league-details-heading">First league</h2>
            <p>Start with one real league. You can add teams and refine course details after setup.</p>
          </div>

          <div className={styles.fieldGrid}>
            <label className={styles.fullWidth}>
              <span>League name</span>
              <input name="leagueName" required minLength="2" maxLength="100" placeholder="e.g. 2026 Wednesday Night League" />
            </label>
            <label>
              <span>Scoring format</span>
              <select name="gameFormat" required defaultValue="stroke_play">
                <option value="stroke_play">Stroke Play</option>
                <option value="match_play">Match Play</option>
                <option value="stableford">Stableford</option>
                <option value="scramble">Scramble</option>
                <option value="skins">Skins</option>
                <option value="nassau">Nassau</option>
              </select>
            </label>
            <label>
              <span>Season length</span>
              <div className={styles.inputSuffix}>
                <input name="seasonLengthWeeks" type="number" required min="1" max="52" step="1" defaultValue="12" />
                <span>weeks</span>
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className={styles.reviewPanel} aria-labelledby="workspace-owner-heading">
        <div>
          <span className={styles.reviewEyebrow}>WORKSPACE OWNER</span>
          <h2 id="workspace-owner-heading">{accountEmail}</h2>
          <p>This account will become the course owner and can invite staff after setup.</p>
        </div>
        <span className={styles.ownerBadge}>Course owner</span>
      </section>

      {previewOnly && (
        <div className={styles.previewNotice} role="status">
          Preview mode: submission is disabled because the local demo database already has a workspace.
        </div>
      )}
      {state?.error && <div className={styles.error} role="alert">{state.error}</div>}

      <div className={styles.submitRow}>
        <p>Birvo creates the course, owner membership, and first league in one database transaction.</p>
        <button type="submit" className="birvo-btn-primary" disabled={pending || previewOnly}>
          {pending ? 'Creating workspace…' : 'Create Birvo workspace →'}
        </button>
      </div>
    </form>
  );
}
