import React, { useEffect, useState } from 'react';
import { invoke } from '../tauri';
import { HeaderTitle, panelStyle, primaryButtonStyle, shellStyle, ui, dragBarStyle } from './design';

interface Repo {
  id: string;
  name: string;
  owner: string;
  enabled: boolean;
}

interface Props {
  onBack: () => void;
}

export const RepoManagement: React.FC<Props> = ({ onBack }) => {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadRepos();
  }, []);

  async function loadRepos() {
    try {
      const list: Repo[] = await invoke('get_repos');
      setRepos(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled(id: string) {
    const repo = repos.find((r) => r.id === id);
    if (!repo) return;
    const nextEnabled = !repo.enabled;
    if (nextEnabled) {
      const currentlyEnabled = repos.filter(r => r.enabled).length;
      if (currentlyEnabled >= 4) {
        window.alert('You can watch up to 4 repos. Disable one before enabling another.');
        return;
      }
    }
    await invoke('set_repo_enabled', { repoId: id, enabled: nextEnabled });
    setRepos((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: nextEnabled } : r)));
  }

  async function handleRemove(id: string) {
    await invoke('remove_repo', { repoId: id });
    setRepos((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleClear(id: string) {
    await invoke('dismiss_repo_items', { repoId: id });
  }

  async function handleSave() {
    setSaving(true);
    const enabledIds = repos.filter((r) => r.enabled).map((r) => r.id);
    await invoke('set_enabled_repos', { repoIds: enabledIds });
    setSaving(false);
    onBack();
  }

  if (loading) {
    return (
      <div style={{ ...shellStyle(300, 540), height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: ui.textMuted, fontSize: 13, fontWeight: 800 }}>Loading repos...</div>
      </div>
    );
  }

  const enabledCount = repos.filter((r) => r.enabled).length;

  const filtered = search
    ? repos.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
    : repos;

  return (
    <div style={{ ...shellStyle(300, 540), height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...panelStyle(true), flex: '0 0 auto', paddingBottom: 10 }}>
        <div data-tauri-drag-region style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'grab' }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: ui.textMuted, fontSize: 14, fontWeight: 800, padding: '4px 4px' }}
          >←</button>
          <HeaderTitle>Repos</HeaderTitle>
          <div style={{ width: 24 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <div style={{ fontSize: 11, color: ui.textFaint, fontWeight: 700 }}>
            {enabledCount} of {repos.length} watched
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={async () => {
                if (!window.confirm('Disable all watched repos?')) return;
                for (const r of repos) {
                  await invoke('set_repo_enabled', { repoId: r.id, enabled: false });
                }
                setRepos((prev) => prev.map((r) => ({ ...r, enabled: false })));
              }}
              style={{ fontSize: 10, color: ui.textFaint, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            >
              disable all
            </button>
            <button
              onClick={async () => {
                if (!window.confirm('Remove all repos from Vigil?')) return;
                for (const r of repos) {
                  await invoke('remove_repo', { repoId: r.id });
                }
                setRepos([]);
              }}
              style={{ fontSize: 10, color: ui.red, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
            >
              remove all
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 14px 0' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repos..."
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: 0,
            border: `1px solid ${ui.border}`,
            background: ui.glass,
            color: ui.text,
            fontSize: 12,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: ui.textMuted, fontWeight: 700 }}>
            No repos yet. Run setup or add repos from GitHub.
          </div>
        )}

        {filtered.map((repo) => {
          const parts = repo.name.split('/');
          const displayName = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : repo.name;
          return (
            <div
              key={repo.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 6px',
                borderBottom: `1px solid ${ui.border}`,
              }}
            >
              {/* Toggle checkbox */}
              <div
                onClick={() => toggleEnabled(repo.id)}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 0,
                  border: `2px solid ${repo.enabled ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                  background: repo.enabled ? '#fff' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
              >
                {repo.enabled && (
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <path d="M1 4l2 2 4-4" stroke="#000" strokeWidth="1.5" fill="none" />
                  </svg>
                )}
              </div>

              {/* Repo name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: repo.enabled ? ui.text : ui.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {displayName}
                </div>
              </div>

              {/* Clear button */}
              <button
                onClick={() => handleClear(repo.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: ui.textFaint, fontSize: 10, fontWeight: 800,
                  padding: '2px 6px', lineHeight: 1,
                }}
                title="Clear items"
              >
                clear
              </button>
              {/* Remove button */}
              <button
                onClick={() => handleRemove(repo.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: ui.textFaint,
                  fontSize: 14,
                  fontWeight: 800,
                  padding: '2px 6px',
                  lineHeight: 1,
                }}
                title="Remove"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Done button */}
      <div style={{ padding: '8px 14px 10px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...primaryButtonStyle,
            opacity: saving ? 0.5 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Done'}
        </button>
      </div>

      <div data-tauri-drag-region style={{ ...dragBarStyle, marginBottom: 8 }} />
    </div>
  );
};
