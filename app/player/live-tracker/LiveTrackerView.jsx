'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { attestOwnScoreAction, submitLiveRound } from './actions';
import {
  ShieldCheckIcon
} from '../../../components/icons/GolfIcons';

export default function LiveTrackerView({ team, match, courseHoles, existingScores, existingScoreId = null }) {
  const [currentHoleIdx, setCurrentHoleIdx] = useState(0);

  // Initialize hole data
  const [scores, setScores] = useState(() => {
    const init = {};
    courseHoles.forEach((h) => {
      init[h.hole_number] = {
        gross: existingScores?.[h.hole_number]?.gross_score || h.par,
        putts: existingScores?.[h.hole_number]?.putts || 2,
        fairwayDir: existingScores?.[h.hole_number]?.fairway_hit ? 'center' : 'center',
        sand: existingScores?.[h.hole_number]?.sand_saves ?? false,
        gir: existingScores?.[h.hole_number]?.gir ?? false,
        firstPuttFeet: 12
      };
    });
    return init;
  });

  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(null);
  const [showAttestModal, setShowAttestModal] = useState(false);
  const [opponentPin, setOpponentPin] = useState('');
  const [attestSuccess, setAttestSuccess] = useState(false);
  const [savedScoreId, setSavedScoreId] = useState(existingScoreId);
  const [errorMessage, setErrorMessage] = useState(null);
  const [attesting, setAttesting] = useState(false);

  const currentHole = courseHoles[currentHoleIdx] || { hole_number: 1, par: 4, stroke_index: 1 };
  const holeData = scores[currentHole.hole_number] || { gross: 4, putts: 2, fairwayDir: 'center', sand: false };

  // Handicap Strokes received on this hole
  const playingHandicap = Math.round(team.current_handicap || 0);
  const strokesReceived = Math.floor(playingHandicap / 18) + (currentHole.stroke_index <= (playingHandicap % 18) ? 1 : 0);

  // Score adjustments
  const updateGross = (delta) => {
    setScores(prev => ({
      ...prev,
      [currentHole.hole_number]: {
        ...prev[currentHole.hole_number],
        gross: Math.max(1, Math.min(15, prev[currentHole.hole_number].gross + delta))
      }
    }));
  };

  const updatePutts = (p) => {
    setScores(prev => ({
      ...prev,
      [currentHole.hole_number]: {
        ...prev[currentHole.hole_number],
        putts: p
      }
    }));
  };

  const setFairwayDir = (dir) => {
    setScores(prev => ({
      ...prev,
      [currentHole.hole_number]: {
        ...prev[currentHole.hole_number],
        fairwayDir: dir
      }
    }));
  };

  const toggleSand = () => {
    setScores(prev => ({
      ...prev,
      [currentHole.hole_number]: {
        ...prev[currentHole.hole_number],
        sand: !prev[currentHole.hole_number].sand
      }
    }));
  };

  // Running totals
  const totalGross = Object.values(scores).reduce((sum, h) => sum + h.gross, 0);
  const totalPar = courseHoles.reduce((sum, h) => sum + h.par, 0);
  const vsPar = totalGross - totalPar;
  const netScore = Number((totalGross - (team.current_handicap || 0)).toFixed(1));

  // Hole result styling (PGA Tour style)
  const diff = holeData.gross - currentHole.par;
  let scoreClass = 'pga-par';
  let term = 'PAR';
  let termColor = '#0f172a';
  if (diff <= -2) {
    scoreClass = 'pga-eagle';
    term = 'EAGLE';
    termColor = '#d97706';
  } else if (diff === -1) {
    scoreClass = 'pga-birdie';
    term = 'BIRDIE';
    termColor = '#059669';
  } else if (diff === 0) {
    scoreClass = 'pga-par';
    term = 'PAR';
    termColor = '#0f172a';
  } else if (diff === 1) {
    scoreClass = 'pga-bogey';
    term = 'BOGEY';
    termColor = '#d97706';
  } else if (diff >= 2) {
    scoreClass = 'pga-double';
    term = 'DOUBLE BOGEY+';
    termColor = '#dc2626';
  }

  // Save Round Action
  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    const formData = new FormData();
    formData.append('matchId', match.id);
    formData.append('weekNumber', match.week_number);

    courseHoles.forEach(h => {
      const d = scores[h.hole_number];
      formData.append(`hole_${h.hole_number}_gross`, d.gross);
      formData.append(`hole_${h.hole_number}_putts`, d.putts);
      formData.append(`hole_${h.hole_number}_fairway`, d.fairwayDir === 'center' ? '1' : '0');
      formData.append(`hole_${h.hole_number}_sand`, d.sand ? '1' : '0');
    });

    try {
      const res = await submitLiveRound(formData);
      if (res?.success) {
        setSavedScoreId(res.scoreId || savedScoreId);
        setSaveToast('Round score saved to the league scorecard.');
        setTimeout(() => setSaveToast(null), 3500);
      } else {
        setErrorMessage(res?.error || 'The scorecard could not be saved.');
      }
    } catch {
      setErrorMessage('The scorecard could not be saved. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAttest = async () => {
    if (!savedScoreId || !/^\d{4}$/.test(opponentPin)) return;
    setAttesting(true);
    setErrorMessage(null);
    const formData = new FormData();
    formData.append('scoreId', savedScoreId);
    formData.append('pin', opponentPin);
    try {
      const res = await attestOwnScoreAction(formData);
      if (res?.success) {
        setAttestSuccess(true);
        setTimeout(() => {
          setShowAttestModal(false);
          setAttestSuccess(false);
          setOpponentPin('');
        }, 1500);
      } else {
        setErrorMessage(res?.error || 'The opponent PIN could not be verified.');
      }
    } catch {
      setErrorMessage('The scorecard could not be attested. Check your connection and try again.');
    } finally {
      setAttesting(false);
    }
  };

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', paddingBottom: '7rem' }}>

      {/* ─── TOP APP HEADER ──────────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1rem 0',
        marginBottom: '1rem'
      }}>
        <Link href="/player" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', fontSize: '0.88rem', fontWeight: 600, textDecoration: 'none' }}>
          ← Back to Portal
        </Link>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--color-primary-light)',
          border: '1px solid var(--color-primary-border)',
          padding: '4px 10px',
          borderRadius: '16px',
          color: '#047857',
          fontSize: '0.75rem',
          fontWeight: 800
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669', boxShadow: '0 0 6px rgba(5, 150, 105, 0.4)' }} />
          LIVE SCORECARD
        </div>
      </header>

      {/* ─── 18-HOLE HORIZONTAL MINI TOUR BAR ────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '6px',
        overflowX: 'auto',
        paddingBottom: '8px',
        marginBottom: '1rem'
      }}>
        {courseHoles.map((h, idx) => {
          const isCurrent = idx === currentHoleIdx;
          const hScore = scores[h.hole_number]?.gross || h.par;
          const hDiff = hScore - h.par;
          return (
            <button
              key={h.hole_number}
              onClick={() => setCurrentHoleIdx(idx)}
              style={{
                flex: '0 0 46px',
                height: '56px',
                borderRadius: '10px',
                border: isCurrent ? '2px solid #059669' : '1px solid var(--color-border)',
                background: isCurrent ? '#ecfdf5' : '#ffffff',
                color: 'var(--color-text-main)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 0',
                transition: 'all 0.15s',
                boxShadow: isCurrent ? 'var(--card-shadow)' : 'none'
              }}
            >
              <span style={{ fontSize: '0.7rem', color: isCurrent ? '#047857' : 'var(--color-text-muted)', fontWeight: 800 }}>
                H{h.hole_number}
              </span>
              <span style={{
                fontSize: '1rem',
                fontWeight: 900,
                color: hDiff < 0 ? '#059669' : hDiff > 0 ? '#d97706' : 'var(--color-text-main)'
              }}>
                {hScore}
              </span>
            </button>
          );
        })}
      </div>

      {/* ─── MAIN HOLE CARD ──────────────────────────────────────────────────────── */}
      <div className="birvo-card" style={{ padding: '1.5rem', marginBottom: '1.25rem', background: '#ffffff' }}>

        {/* Hole Title & Meta Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '2rem', margin: 0, fontWeight: 900, color: 'var(--color-text-main)', letterSpacing: '-0.03em' }}>
                Hole #{currentHole.hole_number}
              </h1>
              {strokesReceived > 0 && (
                <span title={`Receives ${strokesReceived} handicap stroke(s) on this hole`} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  background: '#fef3c7',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 800
                }}>
                  {Array(strokesReceived).fill('●').join('')}
                </span>
              )}
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.88rem', marginTop: '2px', fontWeight: 600 }}>
              Par {currentHole.par} • Stroke Index {currentHole.stroke_index}
            </div>
          </div>

        </div>

        {/* ─── SCORE ENTRY & STROKE COUNTER ─────────────────────────────────────── */}
        <div style={{
          background: 'var(--color-bg-subtle)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid var(--color-border)',
          textAlign: 'center',
          marginBottom: '1.25rem'
        }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Hole Strokes (Gross)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', margin: '0.75rem 0' }}>
            <button
              onClick={() => updateGross(-1)}
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-main)',
                fontSize: '1.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: 'var(--card-shadow)'
              }}
            >
              −
            </button>

            <div style={{ minWidth: '90px' }}>
              <span className={scoreClass} style={{ width: '64px', height: '64px', fontSize: '2.2rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontWeight: 900 }}>
                {holeData.gross}
              </span>
            </div>

            <button
              onClick={() => updateGross(1)}
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: '#059669',
                border: 'none',
                color: '#ffffff',
                fontSize: '1.8rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(5, 150, 105, 0.3)'
              }}
            >
              +
            </button>
          </div>

          <div style={{ fontSize: '1rem', fontWeight: 800, color: termColor }}>
            {term} {diff !== 0 && `(${diff > 0 ? `+${diff}` : diff})`}
          </div>
        </div>

        {/* ─── SHOT TRACKING ATTRIBUTES (PUTTS, FIR, SAND) ─────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.25rem' }}>

          {/* Putts Selector */}
          <div style={{ background: 'var(--color-bg-subtle)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: 700 }}>
              Putts on Green
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
              {[1, 2, 3, 4].map(p => (
                <button
                  key={p}
                  onClick={() => updatePutts(p)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    border: holeData.putts === p ? '1px solid #059669' : '1px solid var(--color-border)',
                    background: holeData.putts === p ? '#059669' : '#ffffff',
                    color: holeData.putts === p ? '#ffffff' : 'var(--color-text-main)',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Sand Save Toggle */}
          <div
            onClick={toggleSand}
            style={{
              background: holeData.sand ? '#fef3c7' : 'var(--color-bg-subtle)',
              border: holeData.sand ? '1px solid #fde68a' : '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '10px',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center'
            }}
          >
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>Sand Save / Bunker</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: holeData.sand ? '#b45309' : 'var(--color-text-main)', marginTop: '2px' }}>
              {holeData.sand ? '🏖️ Saved' : 'None'}
            </div>
          </div>
        </div>

        {/* Fairway Direction (Par 4 & Par 5) */}
        {currentHole.par > 3 && (
          <div style={{ background: 'var(--color-bg-subtle)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', marginBottom: '8px', fontWeight: 700 }}>
              Tee Shot / Fairway Direction
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
              {[
                { id: 'left', label: '← Left Rough' },
                { id: 'center', label: '🎯 Fairway Hit' },
                { id: 'right', label: 'Right Rough →' }
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFairwayDir(f.id)}
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    border: holeData.fairwayDir === f.id ? '1px solid #059669' : '1px solid var(--color-border)',
                    background: holeData.fairwayDir === f.id ? '#ecfdf5' : '#ffffff',
                    color: holeData.fairwayDir === f.id ? '#047857' : 'var(--color-text-muted)',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Previous / Next Hole Controls */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setCurrentHoleIdx(Math.max(0, currentHoleIdx - 1))}
            disabled={currentHoleIdx === 0}
            className="birvo-btn-secondary"
            style={{
              flex: 1,
              padding: '11px',
              cursor: currentHoleIdx === 0 ? 'not-allowed' : 'pointer',
              opacity: currentHoleIdx === 0 ? 0.4 : 1
            }}
          >
            ← Previous Hole
          </button>
          <button
            onClick={() => setCurrentHoleIdx(Math.min(courseHoles.length - 1, currentHoleIdx + 1))}
            disabled={currentHoleIdx === courseHoles.length - 1}
            className="birvo-btn-primary"
            style={{
              flex: 1,
              padding: '11px',
              cursor: currentHoleIdx === courseHoles.length - 1 ? 'not-allowed' : 'pointer',
              opacity: currentHoleIdx === courseHoles.length - 1 ? 0.4 : 1
            }}
          >
            Next Hole →
          </button>
        </div>
      </div>

      {/* ─── TOAST NOTIFICATION ─────────────────────────────────────────────────── */}
      {saveToast && (
        <div style={{
          padding: '12px 18px',
          background: '#059669',
          color: '#ffffff',
          borderRadius: '8px',
          fontWeight: 700,
          fontSize: '0.9rem',
          textAlign: 'center',
          marginBottom: '1rem',
          boxShadow: 'var(--card-shadow-lg)'
        }}>
          ✅ {saveToast}
        </div>
      )}
      {errorMessage && (
        <div role="alert" style={{ padding: '12px 18px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', textAlign: 'center', marginBottom: '1rem' }}>
          {errorMessage}
        </div>
      )}

      {/* ─── FLOATING TOURNAMENT BOTTOM BAR ─────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#ffffff',
        borderTop: '1px solid var(--color-border)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
        padding: '12px 16px',
        zIndex: 50
      }}>
        <div style={{ maxWidth: '520px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
              Round Total (Gross / Net)
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--color-text-main)' }}>
              {totalGross} <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>({vsPar > 0 ? `+${vsPar}` : vsPar === 0 ? 'E' : vsPar})</span>
              <span style={{ margin: '0 6px', color: 'var(--color-border)' }}>|</span>
              Net: <span style={{ color: '#0284c7' }}>{netScore}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowAttestModal(true)}
              disabled={!savedScoreId}
              className="birvo-btn-secondary"
              style={{
                padding: '9px 14px',
                fontSize: '0.85rem',
                opacity: savedScoreId ? 1 : 0.5,
                cursor: savedScoreId ? 'pointer' : 'not-allowed'
              }}
            >
              Attest
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="birvo-btn-primary"
              style={{
                padding: '9px 18px',
                fontSize: '0.88rem'
              }}
            >
              {saving ? 'Saving...' : 'Save Round'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── OPPONENT ATTESTATION MODAL ─────────────────────────────────────────── */}
      {showAttestModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          zIndex: 999
        }}>
          <div className="birvo-card" style={{ width: '100%', maxWidth: '380px', padding: '2rem', textAlign: 'center', background: '#ffffff' }}>
            <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'var(--color-primary-light)', border: '1px solid var(--color-primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
              <ShieldCheckIcon size={26} color="#059669" />
            </div>

            <h3 style={{ fontSize: '1.35rem', color: 'var(--color-text-main)', margin: '0 0 0.5rem 0', fontWeight: 800 }}>Attest Scorecard</h3>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              Hand your device to your playing opponent or marker to enter their 4-digit PIN for official verification.
            </p>

            {attestSuccess ? (
              <div style={{ padding: '1rem', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#047857', borderRadius: '8px', fontWeight: 700 }}>
                Scorecard Attested Successfully!
              </div>
            ) : (
              <div>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="••••"
                  value={opponentPin}
                  onChange={(e) => setOpponentPin(e.target.value)}
                  style={{
                    width: '140px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-subtle)',
                    color: 'var(--color-text-main)',
                    fontSize: '1.8rem',
                    textAlign: 'center',
                    letterSpacing: '8px',
                    marginBottom: '1.5rem',
                    outline: 'none',
                    fontWeight: 800
                  }}
                />

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setShowAttestModal(false)}
                    className="birvo-btn-secondary"
                    style={{ flex: 1, padding: '11px', fontSize: '0.88rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAttest}
                    disabled={attesting || opponentPin.length !== 4}
                    className="birvo-btn-primary"
                    style={{ flex: 1, padding: '11px', fontSize: '0.88rem' }}
                  >
                    {attesting ? 'Verifying...' : 'Verify & Sign'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
