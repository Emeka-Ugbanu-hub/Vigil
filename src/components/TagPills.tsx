import React from 'react';
import { getTagColor } from '../engine/scoring';

interface Props {
  tags: string[];
}

const emojiForTag: Record<string, string> = {
  'AI-SLOP': '⚠',
  'FIRST-TIMER': '👋',
  BOT: '🤖',
  URGENT: '🔴',
  TODAY: '🟠',
  LATER: '🟡',
  NOISE: '⚪',
};

export const TagPills: React.FC<Props> = ({ tags }) => (
  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
    {tags.map((tag) => (
      <span
        key={tag}
        style={{
          padding: '3px 8px',
          borderRadius: 0,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0,
          background: `${getTagColor(tag)}22`,
          color: getTagColor(tag),
          border: `1px solid ${getTagColor(tag)}44`,
          lineHeight: 1.15,
        }}
      >
        {emojiForTag[tag] && `${emojiForTag[tag]} `}{tag}
      </span>
    ))}
  </div>
);
