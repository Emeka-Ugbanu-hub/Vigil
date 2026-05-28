import React from 'react';
import { openUrl } from '../tauri';
import { panelStyle, shellStyle, primaryButtonStyle, ui } from './design';

interface Props {
  onDone: () => void;
}

const FEATURES = [
  {
    title: 'Dependabot alerts',
    what: 'Catches dependency CVEs before they hit production.',
    path: 'Settings → Code security → Dependabot → Enable',
  },
  {
    title: 'Secret scanning',
    what: 'Alerts when tokens or keys leak in commits.',
    path: 'Settings → Code security → Secret scanning → Enable',
  },
  {
    title: 'Discussions',
    what: 'Tracks community conversations alongside issues.',
    path: 'Settings → Features → Discussions → Enable',
  },
];

export const PostSetup: React.FC<Props> = ({ onDone }) => {
  return (
    <div style={{ ...shellStyle(300, 360), height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...panelStyle(true), flex: '0 0 auto', paddingBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: ui.text, marginBottom: 2 }}>
          Your repos are ready
        </div>
        <div style={{ fontSize: 11, color: ui.textMuted, lineHeight: 1.35 }}>
          Vigil is watching. Enable these 3 features on each repo for full coverage.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FEATURES.map((f, i) => (
          <div key={i} style={{ background: ui.surface, border: `1px solid ${ui.border}`, padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: ui.text, marginBottom: 2 }}>
              {i + 1}. {f.title}
            </div>
            <div style={{ fontSize: 10, color: ui.textMuted, lineHeight: 1.35, marginBottom: 4 }}>
              {f.what}
            </div>
            <div style={{ fontSize: 9, color: ui.textFaint, fontFamily: 'monospace' }}>
              {f.path}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 14px', borderTop: `1px solid ${ui.border}`, fontSize: 9, color: ui.textFaint, textAlign: 'center' }}>
        Free for public repos · enable per repo on GitHub
      </div>

      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
        <button onClick={() => openUrl('https://github.com/settings/repositories')} style={{
          flex: 1, padding: '8px 14px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
          background: ui.surface, color: ui.textMuted, border: `1px solid ${ui.border}`,
        }}>
          Open GitHub →
        </button>
        <button onClick={onDone} style={{
          ...primaryButtonStyle, flex: 1,
        }}>
          Done →
        </button>
      </div>
    </div>
  );
};
