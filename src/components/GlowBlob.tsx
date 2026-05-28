import React from 'react';

interface Props {
  size?: number;
  opacity?: number;
  top?: number;
  right?: number;
}

export const GlowBlob: React.FC<Props> = ({ size = 250, opacity = 0.07, top = -60, right = -40 }) => (
  <div
    style={{
      position: 'absolute',
      top,
      right,
      width: size,
      height: size,
      borderRadius: 0,
      background: `rgba(255, 255, 255, ${opacity})`,
      pointerEvents: 'none',
      zIndex: 0,
    }}
  />
);
