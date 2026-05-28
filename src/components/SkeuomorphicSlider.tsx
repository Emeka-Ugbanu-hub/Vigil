import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ui } from './design';

interface Props {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
}

export const SkeuomorphicSlider: React.FC<Props> = ({
  min,
  max,
  step,
  value,
  onChange,
  label,
  unit = '',
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percent = ((value - min) / (max - min)) * 100;

  const handleMove = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const pct = x / rect.width;
      const raw = min + pct * (max - min);
      const stepped = Math.round(raw / step) * step;
      onChange(Math.max(min, Math.min(max, stepped)));
    },
    [min, max, step, onChange]
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => handleMove(e.clientX);
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, handleMove]);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
      }}>
        <label style={{
          fontSize: 11,
          color: ui.textMuted,
          fontWeight: 800,
        }}>
          {label}
        </label>
        <span style={{
          fontSize: 11,
          fontWeight: 900,
          color: ui.text,
          fontFamily: 'monospace',
        }}>
          {value}{unit}
        </span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        onMouseDown={(e) => {
          setIsDragging(true);
          handleMove(e.clientX);
        }}
        style={{
          width: '100%',
          height: 8,
          background: ui.surfacePressed,
          border: `1px solid ${ui.border}`,
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
          cursor: 'pointer',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Fill */}
        <div style={{
          width: `${percent}%`,
          height: '100%',
          background: ui.surfaceElevated,
          borderRight: `1px solid ${ui.borderStrong}`,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }} />

        {/* Handle */}
        <div style={{
          position: 'absolute',
          left: `calc(${percent}% - 8px)`,
          width: 16,
          height: 20,
          background: ui.surfaceElevated,
          border: `1px solid ${ui.borderStrong}`,
          boxShadow: isDragging
            ? '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
            : '0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
          cursor: 'grab',
          transition: isDragging ? 'none' : 'box-shadow 0.15s',
          zIndex: 2,
        }} />
      </div>

      {/* Ticks */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 4,
      }}>
        <span style={{ fontSize: 10, color: ui.textFaint, fontWeight: 700 }}>
          {min}{unit}
        </span>
        <span style={{ fontSize: 10, color: ui.textFaint, fontWeight: 700 }}>
          {max}{unit}
        </span>
      </div>
    </div>
  );
};
