import React, { useEffect, useState } from 'react';
import { invoke } from '../tauri';
import { PillTabs } from './PillTabs';
import { ItemRow } from './ItemRow';
import type { Item, Summary, Tab } from '../engine/types';
import { HeaderTitle, IconButton, panelStyle, contentStyle, shellStyle, ui } from './design';

interface Repo { id: string; name: string; owner: string; enabled: boolean; }

interface Props {
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenDetail: (id: string) => void;
  initialTab?: Tab;
}

export const Inbox: React.FC<Props> = ({ onBack, onOpenSettings, onOpenDetail, initialTab }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'all');
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);

  useEffect(() => {
    invoke<Repo[]>('get_repos').then(setRepos).catch(() => {});
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [activeTab, activeRepo]);

  function loadData() {
    invoke<Item[]>('get_items', {
      query: {
        repo_id: activeRepo,
        priority: null,
        include_dismissed: false,
        tab: activeTab === 'all' ? null : activeTab,
      },
    }).then(setItems).catch(console.error);
    invoke<Summary>('get_summary').then(setSummary).catch(console.error);
  }

  async function handleDismiss(id: string) {
    try {
      await invoke('dismiss_item', { id });
      setItems((prev) => prev.filter((item) => item.id !== id));
      invoke<Summary>('get_summary').then(setSummary).catch(() => {});
    } catch (e) {
      console.error(e);
    }
  }

  const s = summary;

  const tabs = [
    { id: 'all', label: 'All', count: s ? s.total_items - s.noise_count : 0 },
    { id: 'urgent', label: 'Urgent', count: s?.urgent_count },
    { id: 'pending', label: 'Pending', count: s?.today_count },
    { id: 'later', label: 'Later', count: s?.later_count },
    { id: 'noise', label: 'Noise', count: s?.noise_count },
  ];

  // Short names for repo pills
  const shortName = (r: Repo) => r.name.split('/').pop()?.slice(0, 8) || r.name;

  return (
    <div style={{ ...shellStyle(300, 540), height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...panelStyle(true), flex: '0 0 auto', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ui.textMuted, fontSize: 14, fontWeight: 800, padding: '4px 4px' }}>←</button>
          <HeaderTitle>Inbox</HeaderTitle>
          <IconButton onClick={onOpenSettings} label="Settings" size={34}>⚙</IconButton>
        </div>
        <div style={{ marginTop: 8, position: 'relative', zIndex: 2 }}>
          <PillTabs tabs={tabs} active={activeTab} onSelect={(id) => setActiveTab(id as Tab)} />
        </div>
      </div>

      {/* Repo filter pills */}
      {repos.length > 1 && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 14px 0', flexWrap: 'wrap' }}>
          <div
            onClick={() => setActiveRepo(null)}
            style={{
              padding: '3px 10px', borderRadius: 0, fontSize: 10, fontWeight: 800, cursor: 'pointer',
              background: !activeRepo ? ui.surfaceElevated : ui.glass,
              color: !activeRepo ? ui.text : ui.textMuted,
              border: `1px solid ${!activeRepo ? ui.borderStrong : ui.border}`,
              transition: 'all 0.1s',
            }}
          >
            All
          </div>
          {repos.filter(r => r.enabled).map((repo) => (
            <div
              key={repo.id}
              onClick={() => setActiveRepo(repo.id === activeRepo ? null : repo.id)}
              style={{
                padding: '3px 10px', borderRadius: 0, fontSize: 10, fontWeight: 800, cursor: 'pointer',
                background: repo.id === activeRepo ? ui.surfaceElevated : ui.glass,
                color: repo.id === activeRepo ? ui.text : ui.textMuted,
                border: `1px solid ${repo.id === activeRepo ? ui.borderStrong : ui.border}`,
                transition: 'all 0.1s',
              }}
            >
              {shortName(repo)}
            </div>
          ))}
          {items.length > 0 && (
            <div style={{ padding: '8px 14px 10px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={async () => {
                  const label = activeRepo ? 'this repo' : 'all repos';
                  if (!window.confirm(`Clear all items for ${label}?`)) return;
                  setItems([]);
                  if (activeRepo) {
                    await invoke('dismiss_repo_items', { repoId: activeRepo });
                    loadData();
                  } else {
                    const all = await invoke<Repo[]>('get_repos');
                    for (const r of all) {
                      await invoke('dismiss_repo_items', { repoId: r.id }).catch(() => {});
                    }
                    loadData();
                  }
                }}
                style={{
                  padding: '5px 16px',
                  borderRadius: 0,
                  fontSize: 10,
                  fontWeight: 800,
                  background: ui.glass,
                  color: ui.textMuted,
                  border: `1px solid ${ui.borderStrong}`,
                  cursor: 'pointer',
                }}
              >
                Clear {activeRepo ? shortName(repos.find(r => r.id === activeRepo)!) : 'all'}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ ...contentStyle, paddingTop: 2, flex: 1 }}>
        {items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: 700 }}>
            All clear — nothing needs you right now.
          </div>
        )}
        {items.map((item, idx) => (
          <ItemRow
            key={item.id}
            item={item}
            isTop={idx === 0}
            onClick={() => onOpenDetail(item.id)}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </div>
  );
};
