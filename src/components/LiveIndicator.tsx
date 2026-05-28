import React from 'react';

export const LiveIndicator: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: 0,
        backgroundColor: '#34c759',
        boxShadow: '0 0 6px rgba(52, 199, 89, 0.6)',
        animation: 'pulse 2s ease-in-out infinite',
      }}
    />
    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>live</span>
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `}</style>
  </div>
);
