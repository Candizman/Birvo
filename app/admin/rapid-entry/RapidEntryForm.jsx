'use client';

import { Fragment, useActionState, useState } from 'react';
import { saveScores } from './actions';
import { SparklesIcon, CheckIcon, AlertCircleIcon, DownloadIcon } from '../../../components/icons/GolfIcons';
import { useToast } from '../../../components/ui/ToastContext';

export default function RapidEntryForm({ teams, substitutes = [], holes = [], formatLabel = 'Stroke play', formatNeedsHoles = false }) {
  const [state, formAction, isPending] = useActionState(saveScores, null);
  const { addToast } = useToast();

  const [inputScores, setInputScores] = useState({});
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [holeScores, setHoleScores] = useState({});
  const [subsByTeam, setSubsByTeam] = useState({});

  const substituteById = new Map(substitutes.map(sub => [String(sub.id), sub]));
  // A format scored hole by hole cannot use a total at all, so its grids start
  // open. Stroke play keeps the one-box-per-team entry it has always had.
  const [openGrids, setOpenGrids] = useState(
    () => new Set(formatNeedsHoles ? teams.map(team => team.id) : [])
  );

  const handleScoreChange = (teamId, val) => {
    setInputScores(prev => ({
      ...prev,
      [teamId]: val
    }));
  };

  const handleHoleChange = (teamId, holeNumber, val) => {
    setHoleScores(prev => ({
      ...prev,
      [teamId]: { ...(prev[teamId] || {}), [holeNumber]: val },
    }));
  };

  const toggleGrid = (teamId) => {
    setOpenGrids(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId); else next.add(teamId);
      return next;
    });
  };

  const holeTotalFor = (teamId) => {
    const card = holeScores[teamId] || {};
    const values = holes.map(hole => Number(card[hole.hole_number]));
    if (values.some(value => !Number.isFinite(value) || value <= 0)) {
      return { total: null, filled: values.filter(v => Number.isFinite(v) && v > 0).length };
    }
    return { total: values.reduce((sum, value) => sum + value, 0), filled: holes.length };
  };

  const handleBulkPasteApply = () => {
    const lines = bulkText.split(/[\r\n\t,]+/).map(s => s.trim()).filter(Boolean);
    const newScores = { ...inputScores };
    teams.forEach((t, idx) => {
      if (lines[idx] && !isNaN(lines[idx])) {
        newScores[t.id] = lines[idx];
      }
    });
    setInputScores(newScores);
    setBulkPasteOpen(false);
    setBulkText('');
    addToast('Bulk scores pasted from clipboard!', 'success');
  };

  return (
    <form action={formAction}>
      {/* ─── HEADER ───────────────────────────────────────────────────────────── */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2.25rem', flexWrap: 'wrap', gap: '1.5rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '5px 14px', borderRadius: '9999px', marginBottom: '0.75rem' }}>
            <SparklesIcon size={16} color="#059669" />
            <span style={{ color: '#047857', fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Scorecard Spreadsheet Engine
            </span>
          </div>
          <h1 style={{ fontSize: '2.4rem', margin: 0, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em' }}>Rapid Score Entry</h1>
          <p style={{ color: '#64748b', marginTop: '6px', fontSize: '1.05rem' }}>
            {formatNeedsHoles
              ? `${formatLabel} is scored hole by hole, so each card needs all ${holes.length} holes.`
              : `Enter ${holes.length}-hole gross totals, bulk-paste from a spreadsheet, or open a card to record it hole by hole.`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setBulkPasteOpen(prev => !prev)}
            className="birvo-btn-secondary"
            style={{ padding: '11px 20px', fontSize: '0.95rem', fontWeight: 700 }}
          >
            📋 Bulk Paste (Excel)
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="birvo-btn-primary"
            style={{ padding: '11px 26px', fontSize: '0.95rem', fontWeight: 800 }}
          >
            {isPending ? 'Saving Scores...' : 'Save All Scores'}
          </button>
        </div>
      </header>

      {/* ─── BULK PASTE MODAL / ACCORDION ──────────────────────────────────────── */}
      {bulkPasteOpen && (
        <div className="birvo-card" style={{ padding: '1.75rem', marginBottom: '2.5rem', border: '1px solid #cbd5e1', background: '#ffffff', borderRadius: '18px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)' }}>
          <h3 style={{ color: '#111827', margin: '0 0 0.5rem 0', fontWeight: 800, fontSize: '1.2rem' }}>Paste Column from Excel / Sheets</h3>
          <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '1.25rem' }}>
            Copy a single column of numbers in Excel (e.g. 72, 75, 78) and paste below to automatically match with the team roster.
          </p>
          <textarea
            rows={4}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="72&#10;75&#10;78&#10;81"
            style={{
              width: '100%',
              padding: '14px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#111827',
              borderRadius: '12px',
              fontSize: '1.1rem',
              fontFamily: 'monospace',
              marginBottom: '1.25rem',
              outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={handleBulkPasteApply}
              className="birvo-btn-primary"
              style={{ padding: '10px 22px', fontSize: '0.95rem' }}
            >
              Apply to Roster
            </button>
            <button
              type="button"
              onClick={() => setBulkPasteOpen(false)}
              className="birvo-btn-secondary"
              style={{ padding: '10px 18px', fontSize: '0.95rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Message */}
      {state?.error && (
        <div style={{
          padding: '1.25rem 1.75rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          borderRadius: '14px',
          marginBottom: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          fontSize: '1rem'
        }}>
          <AlertCircleIcon size={22} color="#dc2626" />
          <span><strong>Error:</strong> {state.error}</span>
        </div>
      )}

      {/* ─── RAPID SPREADSHEET MATRIX ──────────────────────────────────────────── */}
      <div className="birvo-card" style={{ padding: '1.75rem', overflowX: 'auto', background: '#ffffff', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', minWidth: '640px', borderCollapse: 'collapse', textAlign: 'left' }} className="tabular-nums">
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              <th style={{ padding: '14px 18px' }}>Team / Player Name</th>
              <th style={{ padding: '14px 18px', textAlign: 'center' }}>Playing HI</th>
              <th style={{ padding: '14px 18px', textAlign: 'center' }}>Substitute</th>
              <th style={{ padding: '14px 18px', width: '180px' }}>Gross Score</th>
              <th style={{ padding: '14px 18px', textAlign: 'center' }}>Calculated Net</th>
              <th style={{ padding: '14px 18px', textAlign: 'center' }}>Hole card</th>
              <th style={{ padding: '14px 18px', textAlign: 'right' }}>Security PIN</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((team, idx) => {
              const currentVal = inputScores[team.id] ?? '';
              const { total: holeTotal, filled } = holeTotalFor(team.id);
              const gridOpen = openGrids.has(team.id);
              const substituteFor = substituteById.get(String(subsByTeam[team.id] ?? '')) || null;
              // Mirrors substitute_playing_handicap: the lower of the two, and
              // the substitute's own when the team has nothing to cap against.
              const playingHandicap = substituteFor
                ? (team.current_handicap > 0
                    ? Math.min(Number(substituteFor.handicap), team.current_handicap)
                    : Number(substituteFor.handicap))
                : team.current_handicap;
              // A completed hole card is the score. The typed total, when there
              // is one, is only there to be checked against it.
              const effectiveGross = holeTotal ?? parseFloat(currentVal);
              const calculatedNet = Number.isFinite(effectiveGross) && effectiveGross > 0
                ? (effectiveGross - playingHandicap).toFixed(1)
                : '-';
              const totalDisagrees = holeTotal !== null && currentVal !== ''
                && Number(currentVal) !== holeTotal;

              return (
                <Fragment key={team.id}>
                <tr style={{ borderBottom: gridOpen ? 'none' : '1px solid #f1f5f9', background: idx % 2 === 0 ? '#f8fafc' : 'transparent' }}>
                  <td style={{ padding: '16px 18px', fontWeight: 800, color: '#111827', fontSize: '1.05rem' }}>
                    {team.name}
                  </td>
                  <td style={{ padding: '16px 18px', textAlign: 'center', color: '#64748b', fontWeight: 700, fontSize: '1rem' }}>
                    {playingHandicap.toFixed(1)}
                    {substituteFor && (
                      <span style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#b45309' }}>
                        was {team.current_handicap.toFixed(1)}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                    {substitutes.length === 0 ? (
                      <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>None on file</span>
                    ) : (
                      <select
                        name={`substitute_${team.id}`}
                        value={subsByTeam[team.id] ?? ''}
                        onChange={(e) => setSubsByTeam(prev => ({ ...prev, [team.id]: e.target.value }))}
                        aria-label={`Substitute playing for ${team.name}`}
                        style={{
                          padding: '8px 10px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700,
                          color: substituteFor ? '#b45309' : '#475569', cursor: 'pointer', maxWidth: '170px',
                          border: substituteFor ? '2px solid #f59e0b' : '1px solid #cbd5e1',
                          background: substituteFor ? '#fffbeb' : '#ffffff',
                        }}
                      >
                        <option value="">Team played</option>
                        {substitutes.map(sub => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name} ({Number(sub.handicap).toFixed(1)})
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: '16px 18px' }}>
                    <input
                      type="number"
                      name={`score_${team.id}`}
                      min="1"
                      max="200"
                      step="1"
                      inputMode="numeric"
                      value={currentVal}
                      onChange={(e) => handleScoreChange(team.id, e.target.value)}
                      placeholder="e.g. 74"
                      aria-label={`Score for ${team.name}`}
                      style={{
                        background: currentVal ? '#ecfdf5' : '#ffffff',
                        border: currentVal ? '2px solid #059669' : '1px solid #cbd5e1',
                        color: '#111827',
                        padding: '10px 16px',
                        borderRadius: '10px',
                        width: '100%',
                        maxWidth: '130px',
                        fontSize: '1.15rem',
                        fontWeight: 900,
                        outline: 'none',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)'
                      }}
                    />
                  </td>
                  <td style={{ padding: '16px 18px', textAlign: 'center', fontWeight: 900, color: calculatedNet !== '-' ? '#0284c7' : '#94a3b8', fontSize: '1.15rem' }}>
                    {calculatedNet}
                  </td>
                  <td style={{ padding: '16px 18px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => toggleGrid(team.id)}
                      aria-expanded={gridOpen}
                      style={{
                        padding: '6px 14px', borderRadius: '9999px', cursor: 'pointer',
                        fontSize: '0.85rem', fontWeight: 800,
                        border: holeTotal !== null ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                        background: holeTotal !== null ? '#ecfdf5' : '#ffffff',
                        color: holeTotal !== null ? '#047857' : '#475569',
                      }}
                    >
                      {holeTotal !== null
                        ? `${holes.length} holes · ${holeTotal}`
                        : filled > 0 ? `${filled} / ${holes.length}` : gridOpen ? 'Hide' : 'Enter holes'}
                    </button>
                  </td>
                  <td style={{ padding: '16px 18px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.92rem' }}>
                    <span style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '9999px' }}>Player PIN protected</span>
                  </td>
                </tr>

                {gridOpen && (
                  <tr style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#f8fafc' : 'transparent' }}>
                    <td colSpan={7} style={{ padding: '0 18px 18px 18px' }}>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        {holes.map(hole => (
                          <label key={hole.hole_number} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textAlign: 'center' }}>
                              {hole.hole_number}
                              <span style={{ color: '#94a3b8', fontWeight: 600 }}> · par {hole.par}</span>
                            </span>
                            <input
                              type="number"
                              name={`hole_${team.id}_${hole.hole_number}`}
                              min="1"
                              max="20"
                              step="1"
                              inputMode="numeric"
                              value={holeScores[team.id]?.[hole.hole_number] ?? ''}
                              onChange={(e) => handleHoleChange(team.id, hole.hole_number, e.target.value)}
                              aria-label={`${team.name}, hole ${hole.hole_number}`}
                              style={{
                                width: '52px', padding: '8px 4px', textAlign: 'center',
                                borderRadius: '8px', fontSize: '1rem', fontWeight: 800,
                                color: '#111827', outline: 'none',
                                border: holeScores[team.id]?.[hole.hole_number]
                                  ? '2px solid #059669' : '1px solid #cbd5e1',
                                background: holeScores[team.id]?.[hole.hole_number] ? '#ecfdf5' : '#ffffff',
                              }}
                            />
                          </label>
                        ))}
                        <div style={{ marginLeft: 'auto', fontSize: '0.9rem', fontWeight: 700, color: totalDisagrees ? '#b91c1c' : '#475569' }}>
                          {holeTotal !== null
                            ? totalDisagrees
                              ? `Holes add to ${holeTotal}, but ${currentVal} was entered as the total`
                              : `Holes add to ${holeTotal}`
                            : `${filled} of ${holes.length} holes entered`}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The server groups hole fields per team and refuses a part-filled card,
          so it has to know how many holes a complete one has. */}
      <input type="hidden" name="holeCount" value={holes.length} />
    </form>
  );
}
