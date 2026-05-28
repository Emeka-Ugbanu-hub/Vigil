import React, { useEffect, useState } from 'react';
import { invoke } from '../tauri';
import { HeaderTitle, panelStyle, primaryButtonStyle, secondaryButtonStyle, shellStyle, ui, dragBarStyle } from './design';

interface AvailableRepo {
  id: string;
  name: string;
  full_name: string;
  owner: string;
  private: boolean;
  description: string | null;
}

interface Props {
  onComplete: () => void;
}

export const RepoSelection: React.FC<Props> = ({ onComplete }) => {
  const [repos, setRepos] = useState<AvailableRepo[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [limitMessage, setLimitMessage] = useState('');

  useEffect(() => {
    invoke<AvailableRepo[]>('fetch_available_repos')
      .then((list) => {
        setRepos(list);
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else if (next.size >= 4) {
        setLimitMessage('You can select up to 4 repos.');
        return prev;
      }
      else { next.add(id); }
      if (next.size <= 4) {
        setLimitMessage('');
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(repos.slice(0, 4).map((r) => r.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleContinue() {
    setSaving(true);
    try {
      await invoke('set_enabled_repos', { repoIds: Array.from(selected) });
      onComplete();
    } catch (e: unknown) {
      setError(String(e));
      setSaving(false);
    }
  }

  const filtered = search
    ? repos.filter(
        (r) =>
          r.full_name.toLowerCase().includes(search.toLowerCase()) ||
          r.owner.toLowerCase().includes(search.toLowerCase())
      )
    : repos;

  if (loading) {
    return (
      <div style={{ ...shellStyle(300, 540), height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: ui.textMuted, fontSize: 13, fontWeight: 800 }}>
          Loading repos...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...shellStyle(300, 540), height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
        <div style={{ fontSize: 12, color: ui.red, fontWeight: 700, textAlign: 'center' }}>
          {error}
        </div>
        <button onClick={() => window.location.reload()} style={secondaryButtonStyle}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ ...shellStyle(300, 540), height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...panelStyle(true), flex: '0 0 auto', paddingBottom: 12 }}>
        <HeaderTitle drag>Vigil</HeaderTitle>
        <div data-tauri-drag-region style={{ position: 'relative', zIndex: 2, cursor: 'grab' }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.08, marginBottom: 4 }}>
            Choose repos
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', fontWeight: 700, lineHeight: 1.3 }}>
            Select up to 4 repos ({selected.size}/4 chosen)
          </div>
        </div>
      </div>

      <div style={{ padding: '8px 14px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter repos..."
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 0,
              border: `1px solid ${ui.border}`,
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: 12,
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button onClick={selectAll} style={{ fontSize: 11, color: ui.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: '0 4px' }}>
            All
          </button>
          <button onClick={deselectAll} style={{ fontSize: 11, color: ui.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: '0 4px' }}>
            None
          </button>
        </div>
        {limitMessage && (
          <div style={{ fontSize: 10, color: ui.yellow, fontWeight: 700, marginBottom: 6 }}>
            {limitMessage}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filtered.map((repo) => {
            const isSelected = selected.has(repo.id);
            return (
              <div
                key={repo.id}
                onClick={() => toggle(repo.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 0,
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 0,
                    border: `2px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                    background: isSelected ? '#fff' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.1s',
                  }}
                >
                  {isSelected && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="#000">
                      <path d="M1 4l2 2 4-4" stroke="#000" strokeWidth="1.5" fill="none" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {repo.owner}/{repo.name}
                  </div>
                  <div style={{ fontSize: 10, color: ui.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {repo.description || (repo.private ? 'Private repo' : '')}
                  </div>
                </div>
                {repo.private && (
                  <div style={{ fontSize: 9, fontWeight: 700, color: ui.yellow, opacity: 0.6 }}>
                    private
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ paddingTop: 8, borderTop: `1px dashed ${ui.border}` }}>
          <button
            onClick={handleContinue}
            disabled={selected.size === 0 || saving}
            style={{
              ...primaryButtonStyle,
              opacity: selected.size === 0 || saving ? 0.4 : 1,
              cursor: selected.size === 0 || saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : `Watch ${selected.size} repo${selected.size !== 1 ? 's' : ''} →`}
          </button>
        </div>
      </div>
    </div>
  );
};
