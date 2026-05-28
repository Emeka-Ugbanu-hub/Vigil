import React from 'react';

interface Props {
  leftText: string;
  rightContent?: React.ReactNode;
}

export const FooterRow: React.FC<Props> = ({ leftText, rightContent }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      padding: '10px 16px 12px',
      borderTop: '1px dashed rgba(255,255,255,0.12)',
      background: 'rgba(255,255,255,0.015)',
    }}
  >
    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', letterSpacing: 0, fontWeight: 700 }}>
      {leftText}
    </span>
    {rightContent && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {rightContent}
      </div>
    )}
  </div>
);
