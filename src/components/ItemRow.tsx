import React from 'react';
import { getPriorityColor } from '../engine/scoring';
import { TagPills } from './TagPills';
import type { Item } from '../engine/types';

interface Props {
  item: Item;
  isTop: boolean;
  onClick: () => void;
  onDismiss: (id: string) => void;
}

export const ItemRow: React.FC<Props> = ({ item, isTop, onClick, onDismiss }) => {
  const timeAgo = getTimeAgo(item.updated_at);

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 11,
        margin: '0 10px 8px',
        padding: '11px 12px',
        borderRadius: 0,
        background: isTop ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)',
        border: '1px solid rgba(255,255,255,0.075)',
        boxShadow: isTop ? `inset 3px 0 0 ${getPriorityColor(item.priority)}` : 'none',
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = isTop ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)'; }}
    >
      <span style={{
        width: 34,
        height: 34,
        borderRadius: 0,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        lineHeight: 1,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>{item.emoji || '📌'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </div>
        <div style={{ marginBottom: 4 }}>
          <TagPills tags={item.tags} />
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.43)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
          {item.detail}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', fontWeight: 700 }}>{timeAgo}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(item.id);
          }}
          title="Remove from inbox"
          style={{
            width: 22,
            height: 22,
            borderRadius: 0,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 13,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ×
        </button>
        <span style={{ fontSize: 17, color: 'rgba(255,255,255,0.28)', lineHeight: 1 }}>›</span>
      </div>
    </div>
  );
};

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
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
