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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  // Group items by repo_name + title
  const grouped = (() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const key = `${item.repo_name}|${item.title}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([key, groupItems]) => ({ key, items: groupItems }));
  })();

  function toggleExpand(key: string) {
    setExpanded(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  function getTimeAgo(dateStr: string) {
    const now = Date.now(); const date = new Date(dateStr).getTime();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return 'now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `${diffDays}d`;
    return `${Math.floor(diffDays / 30)}mo`;
  }

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
        </div>
      )}

      {items.length > 0 && (
        <div style={{ padding: '8px 14px 10px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={async () => {
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

      <div style={{ ...contentStyle, paddingTop: 2, flex: 1 }}>
        {grouped.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: 700 }}>
            All clear — nothing needs you right now.
          </div>
        )}
        {grouped.map((group, idx) => (
          <div key={group.key}>
            <div
              onClick={() => { if (group.items.length > 1) toggleExpand(group.key); }}
              style={{ position: 'relative', cursor: group.items.length > 1 ? 'pointer' : undefined }}
            >
              <ItemRow
                item={group.items[0]}
                isTop={idx === 0 && !expanded.has(group.key)}
                onClick={group.items.length === 1 ? (() => onOpenDetail(group.items[0].id)) : undefined}
                onDismiss={group.items.length === 1 ? handleDismiss : undefined}
              />
              {group.items.length > 1 && (
                <div style={{
                  position: 'absolute', top: 6, right: 8,
                  background: ui.surfaceElevated, border: `1px solid ${ui.borderStrong}`,
                  padding: '2px 7px', borderRadius: 0,
                  fontSize: 9, fontWeight: 900, color: ui.textMuted,
                }}>
                  ×{group.items.length}
                </div>
              )}
            </div>
            {expanded.has(group.key) && (
              <div style={{ margin: '-4px 10px 6px', background: ui.surface, border: `1px solid ${ui.border}`, borderTop: 'none' }}>
                {group.items.map((item, subIdx) => (
                  <div key={item.id} onClick={() => onOpenDetail(item.id)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 10px 5px 12px',
                    borderBottom: subIdx < group.items.length - 1 ? `1px solid ${ui.border}` : 'none',
                    cursor: 'pointer', fontSize: 11, color: ui.textMuted, fontWeight: 700,
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = ui.glass; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                      <span style={{ color: ui.red }}>●</span> {item.detail}
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 9, color: ui.textFaint, fontWeight: 700 }}>
                      {getTimeAgo(item.updated_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
