import React, { useEffect, useState } from 'react';
import { invoke, ERR_NOT_IN_TAURI, setWindowSize } from './tauri';
import { PopoverSummary } from './components/PopoverSummary';
import { Onboarding } from './components/Onboarding';
import { RepoSelection } from './components/RepoSelection';
import { PostSetup } from './components/PostSetup';
import { RepoSetupTips } from './components/RepoSetupTips';
import { RepoManagement } from './components/RepoManagement';
import { Inbox } from './components/Inbox';
import { ItemDetail } from './components/ItemDetail';
import { Settings } from './components/Settings';
import type { Tab } from './engine/types';

type Screen = 'loading' | 'onboarding' | 'repo_selection' | 'post_setup' | 'repo_management' | 'summary' | 'inbox' | 'detail' | 'settings' | 'no_tauri';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('loading');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showTips, setShowTips] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  useEffect(() => {
    invoke<boolean>('is_authenticated')
      .then((authed) => {
        if (!authed) {
          setScreen('onboarding');
        } else {
          checkRepos();
        }
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === ERR_NOT_IN_TAURI) {
          setScreen('no_tauri');
        } else {
          setScreen('onboarding');
        }
      });
  }, []);

  // Resize popover based on screen
  useEffect(() => {
    const tall = ['inbox', 'detail', 'settings', 'repo_management'].includes(screen);
    setWindowSize(300, tall ? 540 : 360).catch(() => {});
  }, [screen]);

  async function checkRepos() {
    const repos: { enabled: boolean }[] = await invoke('get_repos');
    const hasEnabled = repos.some((r) => r.enabled);
    setScreen(hasEnabled ? 'summary' : 'repo_selection');
  }

  if (screen === 'loading') return null;

  if (screen === 'no_tauri') {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: 'transparent',
        }}
      >
        <div
          style={{
            width: 280,
            padding: '24px 20px',
            borderRadius: 36,
            background: 'linear-gradient(180deg, #080809 0%, #020203 100%)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 12 }}>🖥️</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 6 }}>
            Run via Tauri
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 12, fontWeight: 700 }}>
            Vigil must run inside the Tauri desktop app, not a browser.
          </div>
          <code
            style={{
              display: 'block',
              padding: '10px 14px',
              borderRadius: 21,
              fontSize: 12,
              fontFamily: 'monospace',
              background: 'rgba(255,255,255,0.10)',
              color: '#fff',
            }}
          >
            npm run tauri dev
          </code>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        background: 'transparent',
        paddingTop: 0,
        overflow: 'hidden',
      }}
    >
      {screen === 'onboarding' && (
        <Onboarding
          onConnected={() => checkRepos()}
          compact
        />
      )}
      {screen === 'repo_selection' && (
        <RepoSelection
          onComplete={() => setScreen('post_setup')}
        />
      )}
      {screen === 'post_setup' && (
        <PostSetup
          onDone={() => {
            setScreen('summary');
            invoke('force_sync').catch(console.error);
          }}
        />
      )}
      {screen === 'summary' && (
        <PopoverSummary
          onOpenInbox={() => { setPendingTab(null); setScreen('inbox'); }}
          onOpenInboxTab={(tab) => { setPendingTab(tab); setScreen('inbox'); }}
          onOpenTips={() => setShowTips(true)}
        />
      )}
      {screen === 'inbox' && (
        <Inbox
          onBack={() => setScreen('summary')}
          onOpenSettings={() => setScreen('settings')}
          onOpenDetail={(id) => {
            setSelectedItemId(id);
            setScreen('detail');
          }}
          initialTab={pendingTab as Tab | undefined}
        />
      )}
      {screen === 'detail' && selectedItemId && (
        <ItemDetail
          itemId={selectedItemId}
          onBack={() => setScreen('inbox')}
        />
      )}
      {screen === 'settings' && (
        <Settings
          onBack={() => setScreen('inbox')}
          onManageRepos={() => setScreen('repo_management')}
        />
      )}
      {screen === 'repo_management' && (
        <RepoManagement
          onBack={() => setScreen('settings')}
        />
      )}
      {showTips && <RepoSetupTips onClose={() => setShowTips(false)} />}
    </div>
  );
};
