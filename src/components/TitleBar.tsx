import React from 'react';
import { minimizeWindow, closeWindow } from '../tauri';

export const TitleBar: React.FC = () => {
  return (
    <div
      data-tauri-drag-region
      style={{
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>
        Vigil
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={minimizeWindow}
          style={{
            width: 12, height: 12, borderRadius: 0,
            border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, transition: 'opacity 0.15s',
          }}
          title="Minimize"
        />
        <button
          onClick={closeWindow}
          style={{
            width: 12, height: 12, borderRadius: 0,
            border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0, transition: 'opacity 0.15s',
          }}
          title="Close"
        />
      </div>
    </div>
  );
};
