import React, { useEffect, useState } from 'react';
import { invoke } from '../tauri';
import { SummaryText } from './SummaryText';
import { PillTabs } from './PillTabs';
import { ItemRow } from './ItemRow';
import { FooterRow } from './FooterRow';
import type { Item, Tab } from '../engine/types';
import { HeaderTitle, IconButton, panelStyle, contentStyle, shellStyle } from './design';

interface Props {
  repoId: string;
  repoName?: string;
  onBack: () => void;
  onOpenDetail: (id: string) => void;
}

export const RepoView: React.FC<Props> = ({ repoId, repoName, onBack, onOpenDetail }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('all');

  useEffect(() => {
    invoke<Item[]>('get_items', {
      query: {
        repo_id: repoId,
        priority: null,
        include_dismissed: false,
        tab: activeTab === 'all' ? null : activeTab,
      },
    }).then(setItems).catch(console.error);
  }, [repoId, activeTab]);

  const tabs = [
    { id: 'all', label: 'All' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'today', label: 'Today' },
    { id: 'later', label: 'Later' },
    { id: 'noise', label: 'Noise' },
  ];

  async function handleDismiss(id: string) {
    try {
      await invoke('dismiss_item', { id });
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div
      style={{
        ...shellStyle(420, 600),
      }}
    >
      <div style={panelStyle()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, position: 'relative', zIndex: 2 }}>
          <IconButton onClick={onBack} label="Back">‹</IconButton>
          <HeaderTitle>{repoName || repoId}</HeaderTitle>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
          <SummaryText
            size={29}
            parts={[
              { text: `${items.length} things`, highlighted: true },
              { text: ' need your attention in ' },
              { text: repoName || 'this repo.', highlighted: true },
            ]}
          />
        </div>

        <div style={{ marginTop: 22, position: 'relative', zIndex: 2 }}>
          <PillTabs tabs={tabs} active={activeTab} onSelect={(id) => setActiveTab(id as Tab)} />
        </div>
      </div>

      <div style={contentStyle}>
        {items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.38)', fontWeight: 700 }}>
            All clear in this repo.
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

      <FooterRow leftText={`${items.length} items`} />
    </div>
  );
};
