'use client';

import React, { useId, useRef } from 'react';
import { CloseIcon } from '../icons/GolfIcons';
import useDialogFocus from './useDialogFocus';

export default function Drawer({ isOpen, onClose, title, children, width = '480px' }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useDialogFocus(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 9995
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: width,
          height: '100%',
          background: '#0f172a',
          borderLeft: '1px solid rgba(212, 175, 55, 0.3)',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Drawer Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <h3 id={titleId} className="title-primary" style={{ margin: 0, fontSize: '1.25rem' }}>{title}</h3>
          <button
            type="button"
            aria-label="Close drawer"
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

        {/* Drawer Content */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
