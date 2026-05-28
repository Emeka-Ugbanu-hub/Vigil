import React, { useEffect, useState } from 'react';
import { invoke } from '../tauri';
import { SummaryText } from './SummaryText';
import type { Summary } from '../engine/types';
import { HeaderTitle, panelStyle, dragBarStyle, primaryButtonStyle, shellStyle } from './design';

interface Props {
  onOpenInbox: () => void;
}

export const Popover: React.FC<Props> = ({ onOpenInbox }) => {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    invoke<Summary>('get_summary').then(setSummary).catch(console.error);
    const interval = setInterval(() => {
      invoke<Summary>('get_summary').then(setSummary).catch(console.error);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const s = summary;

  return (
    <div
      style={{
        ...shellStyle(300, 360),
        height: 360,
      }}
    >
      <div style={{ ...panelStyle(true), minHeight: 258 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22, position: 'relative', zIndex: 2 }}>
          <HeaderTitle drag>Vigil</HeaderTitle>
        </div>

        <div data-tauri-drag-region style={{ position: 'relative', zIndex: 2, cursor: 'grab' }}>
          <SummaryText
            size={23}
            parts={[
              { text: 'Hey, ' },
              { text: `${s?.urgent_count || 0} critical`, highlighted: true },
              { text: ' items and ' },
              { text: `${s?.waiting_prs || 0} PRs`, highlighted: true },
              { text: ' are waiting.' },
            ]}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <div style={{ width: 34, height: 34,             borderRadius: 0, background: '#fff', color: '#0b63f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900 }}>●</div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.48)', fontWeight: 800 }}>
              {s?.today_count || 0} today · {s?.repos_count || 0} repos
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between' }}>
        <div data-tauri-drag-region style={dragBarStyle} />
        <button onClick={onOpenInbox} style={primaryButtonStyle}>Open Vigil →</button>
      </div>
    </div>
  );
};
