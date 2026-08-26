'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '../../../components/ui/Modal';
import { applyGhostAction } from './actions';
import styles from './ghostManager.module.css';

export default function GhostManager({ missingTeams = [], weekNumber }) {
  const router = useRouter();
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleConfirm = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const formData = new FormData();
      formData.append('teamId', selectedTeam.id);
      const res = await applyGhostAction(formData);
      if (res && res.success) {
        setSuccessMsg(`Ghost score applied for ${selectedTeam.name}. Gross: ${res.ghostGross}, Net: ${res.netScore}`);
        router.refresh();
        setTimeout(() => setSuccessMsg(''), 5000);
      } else {
        setErrorMsg(res?.error || 'Unable to apply the ghost score.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to apply the ghost score.');
    } finally {
      setLoading(false);
      setSelectedTeam(null);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Missing Scorecards — Week {weekNumber} ({missingTeams.length})</h2>

      {successMsg && <div className={styles.successMessage}>{successMsg}</div>}
      {errorMsg && <div className={styles.errorMessage} role="alert">{errorMsg}</div>}

      {missingTeams.length === 0 ? (
        <p className={styles.emptyText}>All scorecards are submitted for this week.</p>
      ) : (
        <ul className={styles.teamList}>
          {missingTeams.map(team => (
            <li key={team.id} className={styles.teamItem}>
              <div className={styles.teamInfo}>
                <span className={styles.teamName}>{team.name}</span>
                <span className={styles.teamHandicap}>Handicap: {team.current_handicap}</span>
              </div>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setSelectedTeam(team)}
              >
                Apply Ghost Score
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={!!selectedTeam}
        onClose={() => !loading && setSelectedTeam(null)}
        title="Apply Ghost Score"
      >
        {selectedTeam && (
          <form onSubmit={handleConfirm}>
            <p className={styles.modalText}>
              Are you sure you want to apply a ghost score penalty to <strong>{selectedTeam.name}</strong> for Week {weekNumber}?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setSelectedTeam(null)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={styles.confirmButton}
                disabled={loading}
              >
                {loading ? 'Applying...' : 'Confirm'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
