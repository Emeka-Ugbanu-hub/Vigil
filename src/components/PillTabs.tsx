import React from 'react';

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  tabs: Tab[];
  active: string;
  onSelect: (id: string) => void;
}

export const PillTabs: React.FC<Props> = ({ tabs, active, onSelect }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {tabs.map((tab) => {
      const isActive = tab.id === active;
      return (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{
            minHeight: 28,
            padding: '6px 13px',
            borderRadius: 0,
            fontSize: 12,
            fontWeight: 800,
            background: isActive ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)',
            color: isActive ? '#fff' : 'rgba(255,255,255,0.58)',
            border: isActive ? '1px solid rgba(255,255,255,0.24)' : '1px solid rgba(255,255,255,0.06)',
            transition: 'all 0.15s',
            letterSpacing: 0,
            boxShadow: isActive ? 'inset 0 1px 0 rgba(255,255,255,0.18)' : 'none',
          }}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span style={{ marginLeft: 5, opacity: 0.6, fontSize: 11 }}>
              {tab.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
