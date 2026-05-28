import React, { useEffect, useState } from 'react';
import { invoke, openUrl } from '../tauri';
import { TagPills } from './TagPills';
import { getPriorityColor } from '../engine/scoring';
import type { Item, Comment as CommentType } from '../engine/types';
import { HeaderTitle, IconButton, panelStyle, contentStyle, glassPanelStyle, shellStyle, ui } from './design';

interface Props {
  itemId: string;
  onBack: () => void;
}

export const ItemDetail: React.FC<Props> = ({ itemId, onBack }) => {
  const [item, setItem] = useState<Item | null>(null);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    invoke<Item>('get_item', { id: itemId }).then(setItem).catch(console.error);
  }, [itemId]);

  async function loadComments() {
    setCommentsLoading(true);
    try {
      await invoke<CommentType[]>('fetch_item_comments', { itemId });
      const dbComments = await invoke<CommentType[]>('get_comments', { itemId });
      setComments(dbComments);
      setShowComments(true);
    } catch {
      const dbComments = await invoke<CommentType[]>('get_comments', { itemId }).catch(() => []);
      setComments(dbComments);
      setShowComments(true);
    } finally {
      setCommentsLoading(false);
    }
  }

  if (!item) {
    return (
      <div style={{ ...shellStyle(300, 540), height: '100%', padding: 24, color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading...
      </div>
    );
  }

  const supportsComments = item.item_type === 'issue' || item.item_type === 'pr' || item.item_type === 'discussion';

  return (
    <div
      style={{
        ...shellStyle(300, 540),
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ ...panelStyle(true), flex: '0 0 auto', paddingBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, position: 'relative', zIndex: 2 }}>
          <IconButton onClick={onBack} label="Back">‹</IconButton>
          <HeaderTitle>{item.repo_name}</HeaderTitle>
          <div style={{ width: 42 }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12, position: 'relative', zIndex: 2 }}>
          <span style={{ width: 44, height: 44, borderRadius: 0, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{item.emoji || '📌'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: 8 }}>
              {item.title}
            </div>
            <TagPills tags={item.tags} />
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.48)', lineHeight: 1.38, fontWeight: 700, position: 'relative', zIndex: 2 }}>
          {item.detail}
        </div>
      </div>

      <div style={{ ...contentStyle, padding: '8px 14px' }}>
        <div style={{ ...glassPanelStyle, padding: 13, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 7 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Priority Score</span>
            <span style={{ color: getPriorityColor(item.priority), fontWeight: 700 }}>{item.score}/100</span>
          </div>
          <div style={{ height: 3, borderRadius: 0, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${item.score}%`, background: getPriorityColor(item.priority), borderRadius: 0, transition: 'width 0.4s' }} />
          </div>
        </div>

        {item.is_first_timer && (
          <div style={{ ...glassPanelStyle, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#7bd8ff', marginBottom: 4 }}>👋 First-Time Contributor</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', lineHeight: 1.4, fontWeight: 700 }}>
              This is someone's first contribution. High abandonment risk after 7 days without a reply. Even a quick acknowledgement keeps them engaged.
            </div>
          </div>
        )}

        {item.is_slop && (
          <div style={{ ...glassPanelStyle, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#d7a0ff', marginBottom: 4 }}>⚠ AI-Slop Detected</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', lineHeight: 1.4, fontWeight: 700 }}>
              This item was flagged by our slop detector based on metadata patterns.
            </div>
          </div>
        )}

        <div style={{ borderTop: '1px dashed rgba(255,255,255,0.12)', margin: '6px 0 8px' }} />

        {supportsComments ? (
          !showComments ? (
            <button
              onClick={loadComments}
              disabled={commentsLoading}
              style={{
                width: '100%', minHeight: 34, borderRadius: 0,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: 800,
                cursor: commentsLoading ? 'not-allowed' : 'pointer',
                opacity: commentsLoading ? 0.6 : 1,
              }}
            >
              {commentsLoading ? 'Loading...' : `Show comments (${item.comments_count})`}
            </button>
          ) : (
            <>
              <div style={{ padding: '6px 0 4px', fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.36)' }}>
                {comments.length} COMMENTS
              </div>
              {comments.map((comment, idx) => (
                <div key={comment.id} style={{ ...glassPanelStyle, padding: '10px 11px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {comment.avatar_url && (
                      <img src={comment.avatar_url} alt="" style={{ width: 16, height: 16, borderRadius: 0 }} />
                    )}
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.72)' }}>@{comment.author}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{formatTime(comment.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.48)', lineHeight: 1.4, paddingLeft: 22, fontWeight: 700 }}>
                    {comment.body}
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <div style={{ padding: '10px', fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontWeight: 700 }}>
                  No comments yet
                </div>
              )}
            </>
          )
        ) : (
          <div style={{ ...glassPanelStyle, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.36)', marginBottom: 6 }}>
              {item.item_type === 'ci' ? 'WORKFLOW DETAILS' :
               item.item_type === 'security' ? 'SECURITY INFO' :
               item.item_type === 'release' ? 'RELEASE INFO' :
               item.item_type === 'force_push' ? 'FORCE PUSH DETAILS' : 'DETAILS'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, fontWeight: 700 }}>
              {item.detail}
            </div>
            {item.body && (
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.35, marginTop: 6, fontWeight: 600 }}>
                {item.body.slice(0, 300)}{item.body.length > 300 ? '...' : ''}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, position: 'relative', zIndex: 1, borderTop: '1px dashed rgba(255,255,255,0.12)' }}>
        <button
          onClick={() => openUrl(item.github_url)}
          style={{
            flex: 1,
            minHeight: 40,
            padding: '9px 16px',
            borderRadius: 0,
            fontSize: 12,
            fontWeight: 900,
            background: 'rgba(255,255,255,0.16)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.16)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
        >
          {item.is_slop ? 'Close with template ↗' : 'Open on GitHub ↗'}
        </button>
        <button
          onClick={async () => {
            await invoke('dismiss_item', { id: item.id });
            onBack();
          }}
          style={{
            minHeight: 40,
            padding: '9px 14px',
            borderRadius: 0,
            fontSize: 11,
            fontWeight: 800,
            color: 'rgba(255,255,255,0.46)',
            border: '1px solid rgba(255,255,255,0.1)',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

function formatTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - date) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}
