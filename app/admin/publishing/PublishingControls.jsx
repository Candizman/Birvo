'use client';

import { useActionState } from 'react';
import { addSponsorAction, deleteSponsorAction, saveDisplayAction } from './actions';
import styles from './publishing.module.css';

function ActionMessage({ state }) {
  return (
    <div className={state?.error ? styles.error : styles.success} aria-live="polite">
      {state?.error || state?.success || ''}
    </div>
  );
}

function DeletePartnerButton({ sponsorId }) {
  const [state, action, pending] = useActionState(deleteSponsorAction, null);
  return (
    <form action={action} className={styles.deleteForm}>
      <input type="hidden" name="sponsorId" value={sponsorId} />
      <button type="submit" className={styles.deleteButton} disabled={pending} aria-label="Remove partner">
        {pending ? 'Removing…' : 'Remove'}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export default function PublishingControls({ leagueName, display, sponsors, tvUrl }) {
  const [displayState, displayAction, displayPending] = useActionState(saveDisplayAction, null);
  const [sponsorState, sponsorAction, sponsorPending] = useActionState(addSponsorAction, null);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Course & publishing</span>
          <h1>Clubhouse TV</h1>
          <p>Control the public leaderboard broadcast for {leagueName}.</p>
        </div>
        {tvUrl ? (
          <a className="birvo-btn-primary" href={tvUrl} target="_blank" rel="noreferrer">Open live display ↗</a>
        ) : (
          <span className={styles.linkWarning}>Define PUBLIC_LINK_SECRET to enable the live display link.</span>
        )}
      </header>

      <div className={styles.grid}>
        <section className={`birvo-card ${styles.card}`}>
          <div className={styles.cardHeading}>
            <div>
              <h2>Broadcast settings</h2>
              <p>Changes apply to the signed clubhouse TV link.</p>
            </div>
            <span className={styles.liveBadge}>LIVE READY</span>
          </div>
          <form action={displayAction} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="rotation-time">Leaderboard rotation time</label>
              <div className={styles.inputSuffix}>
                <input id="rotation-time" name="autoScrollSpeed" type="number" min="3" max="120" step="1" defaultValue={display.auto_scroll_speed || 8} required />
                <span>seconds</span>
              </div>
              <small>Used only when the leaderboard has more than one page.</small>
            </div>
            <div className={styles.field}>
              <label htmlFor="announcement">Announcement ticker</label>
              <textarea id="announcement" name="announcementText" rows="4" maxLength="500" defaultValue={display.announcement_text || ''} placeholder="Welcome players, guests, and club partners." />
            </div>
            <label className={styles.checkRow}>
              <input name="showAnnouncements" type="checkbox" defaultChecked={display.show_announcements !== false && display.show_announcements !== 0} />
              <span><strong>Show announcement ticker</strong><small>Display the message at the bottom of the broadcast.</small></span>
            </label>
            <label className={styles.checkRow}>
              <input name="celebrationEffects" type="checkbox" defaultChecked={Boolean(display.celebration_effects)} />
              <span><strong>Celebration effects</strong><small>Enable winner highlights and presentation accents.</small></span>
            </label>
            <label className={styles.checkRow}>
              <input name="soundEnabled" type="checkbox" defaultChecked={Boolean(display.sound_enabled)} />
              <span><strong>Broadcast sound</strong><small>Keep disabled for silent clubhouse signage.</small></span>
            </label>
            <button className="birvo-btn-primary" type="submit" disabled={displayPending}>
              {displayPending ? 'Saving…' : 'Save broadcast settings'}
            </button>
            <ActionMessage state={displayState} />
          </form>
        </section>

        <section className={`birvo-card ${styles.card}`}>
          <div className={styles.cardHeading}>
            <div>
              <h2>Club partners</h2>
              <p>Partners appear in display order on the TV sidebar.</p>
            </div>
            <span className={styles.countBadge}>{sponsors.length}</span>
          </div>

          <div className={styles.partnerList}>
            {sponsors.length === 0 ? (
              <p className={styles.empty}>No club partners are in the rotation yet.</p>
            ) : sponsors.map((sponsor) => (
              <div className={styles.partner} key={sponsor.id}>
                <span className={styles.order}>{sponsor.display_order}</span>
                <div><strong>{sponsor.name}</strong><small>{sponsor.logo_url || 'Text-only placement'}</small></div>
                <DeletePartnerButton sponsorId={sponsor.id} />
              </div>
            ))}
          </div>

          <form action={sponsorAction} className={`${styles.form} ${styles.addForm}`}>
            <h3>Add a partner</h3>
            <div className={styles.field}>
              <label htmlFor="partner-name">Partner name</label>
              <input id="partner-name" name="name" minLength="2" maxLength="100" required placeholder="e.g. Fairway Grill" />
            </div>
            <div className={styles.field}>
              <label htmlFor="partner-logo">Logo URL <span>(optional)</span></label>
              <input id="partner-logo" name="logoUrl" type="text" maxLength="2048" placeholder="https://example.com/logo.png" />
              <small>Use an HTTPS URL or a path hosted by Birvo.</small>
            </div>
            <div className={styles.field}>
              <label htmlFor="partner-order">Display order</label>
              <input id="partner-order" name="displayOrder" type="number" min="0" max="1000" defaultValue={sponsors.length + 1} required />
            </div>
            <button className="birvo-btn-secondary" type="submit" disabled={sponsorPending}>
              {sponsorPending ? 'Adding…' : 'Add to partner rotation'}
            </button>
            <ActionMessage state={sponsorState} />
          </form>
        </section>
      </div>
    </div>
  );
}
