import React from 'react';

export const ui = {
  bg: '#000000',
  surface: '#111111',
  surfaceElevated: '#1a1a1a',
  surfacePressed: '#0a0a0a',
  glass: 'rgba(255,255,255,0.04)',
  glassStrong: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',
  borderHighlight: 'rgba(255,255,255,0.25)',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.5)',
  textFaint: 'rgba(255,255,255,0.3)',
  white: '#ffffff',
  green: '#34c759',
  yellow: '#ffd25a',
  red: '#ff5a68',
};

// Full-screen container — sharp corners, black background
export const shellStyle = (width = 420, maxHeight = 600): React.CSSProperties => ({
  width: `min(100vw, ${width}px)`,
  maxHeight: `min(100vh, ${maxHeight}px)`,
  borderRadius: 0,
  background: ui.bg,
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

// Main content panel — dark surface with physical border and shadow
export const panelStyle = (compact = false): React.CSSProperties => ({
  margin: compact ? 0 : 8,
  padding: compact ? '14px 14px 16px' : '14px 16px 18px',
  borderRadius: 0,
  background: ui.surface,
  position: 'relative',
  overflow: 'hidden',
  borderTop: `1px solid ${ui.borderHighlight}`,
  borderBottom: `1px solid ${ui.border}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 20px rgba(0,0,0,0.5)',
});

// Drag handle bar
export const dragBarStyle: React.CSSProperties = {
  width: 42,
  height: 4,
  borderRadius: 0,
  background: 'rgba(255,255,255,0.12)',
  alignSelf: 'center',
  cursor: 'grab',
};

// Navigation row
export const navRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 20,
  position: 'relative',
  zIndex: 2,
};

// Title text
export const titleStyle: React.CSSProperties = {
  color: ui.text,
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1,
};

// Icon button — physical circular button with border and shadow
export const iconButtonStyle = (size = 42): React.CSSProperties => ({
  width: size,
  height: size,
  minWidth: size,
  borderRadius: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: ui.surfaceElevated,
  color: 'rgba(255,255,255,0.9)',
  border: `1px solid ${ui.borderStrong}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.3)',
  fontSize: Math.max(13, Math.round(size * 0.43)),
  fontWeight: 800,
  lineHeight: 1,
  transition: 'all 0.15s ease',
});

export const IconButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  label?: string;
  size?: number;
  drag?: boolean;
}> = ({ children, onClick, label, size = 42, drag = false }) => (
  <button
    aria-label={label}
    title={label}
    onClick={onClick}
    data-tauri-drag-region={drag || undefined}
    style={iconButtonStyle(size)}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = ui.surface;
      e.currentTarget.style.borderColor = ui.borderHighlight;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = ui.surfaceElevated;
      e.currentTarget.style.borderColor = ui.borderStrong;
    }}
  >
    {children}
  </button>
);

// Header title
export const HeaderTitle: React.FC<{
  children: React.ReactNode;
  drag?: boolean;
}> = ({ children, drag = false }) => (
  <div
    data-tauri-drag-region={drag || undefined}
    style={{
      minHeight: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 16,
      fontWeight: 900,
      cursor: drag ? 'grab' : 'default',
      minWidth: 0,
      flex: 1,
    }}
  >
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  </div>
);

// Scrollable content area
export const contentStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  position: 'relative',
  zIndex: 1,
  padding: '6px 0',
};

// Glass panel — elevated physical panel with strong border and inner shadow
export const glassPanelStyle: React.CSSProperties = {
  borderRadius: 0,
  background: ui.glassStrong,
  border: `1px solid ${ui.borderStrong}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.3)',
};

// Physical button — raised button with bevel, border, and shadow
export const primaryButtonStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '10px 14px',
  borderRadius: 0,
  fontSize: 13,
  fontWeight: 800,
  background: ui.surfaceElevated,
  color: ui.text,
  border: `1px solid ${ui.borderStrong}`,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.4)',
  transition: 'all 0.15s ease',
};

// Secondary button — recessed/flat button
export const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: ui.surface,
  color: ui.textMuted,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
};

// Inset / pressed button style
export const insetButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: ui.surfacePressed,
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)',
  borderColor: ui.border,
};

// Dashed divider
export const dividerStyle: React.CSSProperties = {
  borderTop: `1px dashed ${ui.border}`,
  margin: '8px 0',
};

// Pill tag / badge — physical raised pill
export const pillStyle = (active = false): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: 0,
  fontSize: 11,
  fontWeight: 800,
  background: active ? ui.surfaceElevated : ui.glass,
  color: active ? ui.text : ui.textMuted,
  border: `1px solid ${active ? ui.borderStrong : ui.border}`,
  boxShadow: active
    ? 'inset 0 1px 0 rgba(255,255,255,0.1), 0 1px 3px rgba(0,0,0,0.3)'
    : 'none',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
});
