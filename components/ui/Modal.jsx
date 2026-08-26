'use client';

import React, { useId, useRef } from 'react';
import { CloseIcon } from '../icons/GolfIcons';
import useDialogFocus from './useDialogFocus';

export default function Modal({ isOpen, onClose, title, children, maxWidth = '540px' }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useDialogFocus(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      zIndex: 9990
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth,
          background: '#0f172a',
          border: '1px solid rgba(212, 175, 55, 0.3)',
          borderRadius: '16px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(212, 175, 55, 0.15)',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <h3 id={titleId} className="title-primary" style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h3>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '6px',
              padding: '6px',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex'
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
