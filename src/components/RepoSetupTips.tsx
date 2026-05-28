import React, { useEffect, useState } from 'react';
import { invoke, openUrl } from '../tauri';
import { ui } from './design';

interface Repo { id: string; name: string; owner: string; enabled: boolean; }

interface Props {
  onClose: () => void;
}

const FEATURES = [
  {
    title: 'Dependabot alerts',
    what: 'Catches dependency CVEs before they hit production. Vigil scores these as urgent.',
    path: 'Security → Code security → Dependabot alerts → Enable',
    url: (owner: string, name: string) =>
      `https://github.com/${owner}/${name}/settings/security_analysis`,
  },
  {
    title: 'Secret scanning',
    what: 'Alerts when tokens, keys, or credentials leak in commits. Vigil flags these as urgent.',
    path: 'Security → Code security → Secret scanning → Enable',
    url: (owner: string, name: string) =>
      `https://github.com/${owner}/${name}/settings/security_analysis`,
  },
  {
    title: 'Discussions',
    what: 'Tracks community conversations alongside issues and PRs. Helps Vigil surface engagement.',
    path: 'Settings → Features → Discussions → Enable',
    url: (owner: string, name: string) =>
      `https://github.com/${owner}/${name}/settings`,
  },
];

export const RepoSetupTips: React.FC<Props> = ({ onClose }) => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');

  useEffect(() => {
    invoke<Repo[]>('get_repos').then((list) => {
      setRepos(list.filter(r => r.enabled));
      if (list.length > 0) setSelectedRepo(list[0].id);
    }).catch(() => {});
  }, []);

  const repo = repos.find(r => r.id === selectedRepo);
  const parts = repo ? repo.name.split('/') : [];
  const owner = parts[0] || '';
  const name = parts[1] || '';

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 100,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${ui.border}`,
      }}>
        <div style={{ fontSize: 15, fontWeight: 900, color: ui.text }}>
          ⓘ Repo features
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none',
            cursor: 'pointer', color: ui.textMuted,
            fontSize: 16, fontWeight: 800, padding: '2px 6px',
          }}
        >
          ×
        </button>
      </div>

      {/* Feature cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FEATURES.map((feature, i) => (
          <div
            key={i}
            style={{
              background: ui.surface,
              border: `1px solid ${ui.border}`,
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 900, color: ui.text, marginBottom: 4 }}>
              {feature.title}
            </div>
            <div style={{ fontSize: 11, color: ui.textMuted, lineHeight: 1.4, marginBottom: 6 }}>
              {feature.what}
            </div>
            <div style={{ fontSize: 10, color: ui.textFaint, fontFamily: 'monospace', marginBottom: 8 }}>
              {feature.path}
            </div>
            <button
              onClick={() => { if (owner && name) openUrl(feature.url(owner, name)); }}
              disabled={!owner || !name}
              style={{
                padding: '4px 12px', borderRadius: 0, fontSize: 10, fontWeight: 800,
                background: ui.surfaceElevated, color: ui.text,
                border: `1px solid ${ui.borderStrong}`,
                cursor: owner ? 'pointer' : 'not-allowed',
                opacity: owner ? 1 : 0.4,
              }}
            >
              Open repo settings ↗
            </button>
          </div>
        ))}
      </div>

      {/* Repo picker */}
      <div style={{
        padding: '10px 14px',
        borderTop: `1px solid ${ui.border}`,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 11, color: ui.textMuted, fontWeight: 700 }}>Repo:</span>
        <select
          value={selectedRepo}
          onChange={(e) => setSelectedRepo(e.target.value)}
          style={{
            flex: 1,
            padding: '5px 8px',
            borderRadius: 0,
            background: ui.glass,
            color: ui.text,
            border: `1px solid ${ui.border}`,
            fontSize: 11,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        >
          {repos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Footer */}
      <div style={{
        padding: '8px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTop: `1px solid ${ui.border}`,
      }}>
        <div style={{ fontSize: 9, color: ui.textFaint }}>
          Enable per repo · free for public repos
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '4px 14px', borderRadius: 0, fontSize: 11, fontWeight: 800,
            background: ui.surfaceElevated, color: ui.text,
            border: `1px solid ${ui.borderStrong}`,
            cursor: 'pointer',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
};
