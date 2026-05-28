import React, { useEffect, useState } from 'react';
import { invoke } from '../tauri';
import { dragBarStyle, ui } from './design';
import type { Summary } from '../engine/types';

interface Props {
  onOpenInbox: () => void;
  onOpenInboxTab?: (tab: string) => void;
  onOpenTips: () => void;
}

export const PopoverSummary: React.FC<Props> = ({ onOpenInbox, onOpenInboxTab, onOpenTips }) => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [username, setUsername] = useState('');

  function refresh() {
    invoke<Summary>('get_summary').then(setSummary).catch(console.error);
    invoke<Record<string, string>>('get_settings').then((s) => {
      if (s.github_username) setUsername(s.github_username);
    }).catch(() => {});
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsub = await listen('summary-updated', refresh);
        unlisten = unsub;
      } catch { /* ignore */ }
    };
    setup();
    return () => { clearInterval(interval); unlisten?.(); };
  }, []);

  const s = summary;
  const total = s?.total_items || 0;
  const repos = s?.repos_count || 0;
  const urgent = s?.urgent_count || 0;
  const today = s?.today_count || 0;
  const noise = s?.noise_count || 0;
  const [syncing, setSyncing] = useState(false);

  function plural(n: number, word: string) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

  function buildSentence() {
    const name = username ? `@${username}` : 'maintainer';
    const greeting = <span style={{ color: ui.text }}>Hey, {name} — </span>;

    if (total === 0 && repos > 0) return <span>{greeting}<span style={{ color: ui.text }}>you're all clear across {plural(repos, 'repo')}.</span></span>;
    if (total === 0 && repos === 0) return <span>{greeting}<span style={{ color: ui.textMuted }}>no repos configured yet.</span></span>;

    const segments: React.ReactNode[] = [greeting, <span style={{ color: ui.text }}>you have </span>];
    const groups: { count: number; label: string; color: string; tab: string }[] = [];
    if (urgent > 0) groups.push({ count: urgent, label: 'urgent', color: ui.red, tab: 'urgent' });
    if (today > 0) groups.push({ count: today, label: 'pending', color: ui.yellow, tab: 'pending' });
    if (noise > 0) groups.push({ count: noise, label: 'noise', color: ui.textFaint, tab: 'noise' });

    if (groups.length === 0) return <span>{greeting}<span style={{ color: ui.text }}>you're all clear across {plural(repos, 'repo')}.</span></span>;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (i > 0) segments.push(<span style={{ color: ui.text }}>{i === groups.length - 1 ? ', and ' : ', '}</span>);
      segments.push(
        <span
          key={g.tab}
          onClick={(e) => { e.stopPropagation(); onOpenInboxTab?.(g.tab); }}
          style={{ color: g.color, cursor: 'pointer' }}
        >
          ● {plural(g.count, `${g.label} item`)}
        </span>
      );
    }
    segments.push(<span style={{ color: ui.text }}>.</span>);
    return <>{segments}</>;
  }

  const statusSentence = buildSentence();

  async function checkNow() {
    setSyncing(true);
    await invoke('force_sync').catch(console.error);
    setSyncing(false);
    refresh();
  }

  return (
    <div onClick={onOpenInbox} style={{
      width: '100%',
      height: '100%',
      cursor: 'pointer',
      borderRadius: 0,
      background: ui.bg,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
    }}>
      {/* Ambient light — top-right */}
      <div style={{
        position: 'absolute',
        width: 200,
        height: 200,
        borderRadius: 0,
        background: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,0.06) 0%, transparent 60%)',
        top: -60,
        right: -60,
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div data-tauri-drag-region style={{
        display: 'flex',
        alignItems: 'center',
        padding: '16px 18px 6px',
        position: 'relative',
        zIndex: 2,
        cursor: 'grab',
      }}>
        <img src="/vigil-logo.svg" alt="Vigil" width="24" height="24" />
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        padding: '4px 18px 14px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        zIndex: 2,
      }}>
        <div>
          {/* Status sentence */}
          <div style={{ fontSize: 16, fontWeight: 800, color: ui.text, lineHeight: 1.35, marginBottom: 14 }}>
            {statusSentence}
          </div>

          {/* Repo count */}
          {repos > 0 && (
            <div style={{ fontSize: 13, fontWeight: 700, color: ui.textMuted, lineHeight: 1.3 }}>
              across {plural(repos, 'repo')}{total > 0 ? '.' : ''}
            </div>
          )}
        </div>

        {/* Footer */}
        <div>
          <div style={{
            borderTop: `1px dashed ${ui.border}`,
            margin: '8px 0 10px',
          }} />

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{
              fontSize: 10,
              color: ui.textFaint,
              fontWeight: 800,
            }}>
              {repos} repos · synced {s ? 'now' : '...'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onOpenTips(); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: ui.textFaint, fontSize: 10, fontWeight: 800,
                  padding: '2px 4px',
                }}
                title="Repo features guide"
              >
                ⓘ tips
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); checkNow(); }}
                disabled={syncing}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  color: ui.textMuted,
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '2px 6px',
                  opacity: syncing ? 0.4 : 0.7,
                }}
                title="Check now"
              >
                {syncing ? '...' : '⟳'}
              </button>
              <div style={{
                padding: '4px 14px',
                borderRadius: 0,
                border: `1px solid ${ui.borderStrong}`,
                fontSize: 10,
                fontWeight: 800,
                color: ui.textMuted,
              }}>
                {total > 0 ? `Inbox →` : 'Setup'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div data-tauri-drag-region style={{
        ...dragBarStyle,
        marginBottom: 8,
      }} />
    </div>
  );
};
