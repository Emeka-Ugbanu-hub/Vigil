import React from 'react';

interface Props {
  parts: Array<{ text: string; highlighted?: boolean }>;
  size?: number;
}

export const SummaryText: React.FC<Props> = ({ parts, size = 22 }) => (
  <div style={{ lineHeight: 1.22, fontSize: size, fontWeight: 800, letterSpacing: 0 }}>
    {parts.map((part, i) => (
      <span
        key={i}
        style={{
          color: part.highlighted ? '#fff' : 'rgba(255,255,255,0.42)',
          transition: 'color 0.2s',
        }}
      >
        {part.text}
      </span>
    ))}
  </div>
);
