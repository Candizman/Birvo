'use client';

import React from 'react';
import { PrinterIcon } from '../../../components/icons/GolfIcons';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        padding: '12px 24px',
        background: '#080c14',
        color: '#ffffff',
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 800,
        fontSize: '0.95rem',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.3)'
      }}
    >
      <PrinterIcon size={18} color="#d4af37" /> Print Cart Plates (PDF)
    </button>
  );
}
