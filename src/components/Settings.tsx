import React, { useEffect, useState } from 'react';
import { invoke, openUrl } from '../tauri';
import { HeaderTitle, IconButton, panelStyle, contentStyle, glassPanelStyle, shellStyle, ui } from './design';
import { SkeuomorphicSlider } from './SkeuomorphicSlider';

interface Props {
  onBack: () => void;
  onManageRepos: () => void;
}

interface DeviceFlowInfo {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}

type AuthStatus = 'idle' | 'connecting' | 'awaiting_user' | 'polling' | 'connected' | 'error';

export const Settings: React.FC<Props> = ({ onBack, onManageRepos }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowInfo | null>(null);
  const [authError, setAuthError] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const s = await invoke<Record<string, string>>('get_settings');
      setSettings(s);
      if (s.github_username && s.github_username !== '') {
        setAuthStatus('connected');
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  function updateSetting(key: string, value: string) {
    invoke<boolean>('update_setting', { key, value }).then(() => {
      setSettings(prev => ({ ...prev, [key]: value }));
    }).catch(console.error);
  }

  async function handleConnect() {
    try {
      setAuthStatus('connecting');
      const flow = await invoke<DeviceFlowInfo>('start_auth');
      setDeviceFlow(flow);
      openUrl(flow.verification_uri);
      setAuthStatus('polling');
      const timer = setInterval(async () => {
        try {
          const authed = await invoke<boolean>('is_authenticated');
          if (authed) {
            clearInterval(timer);
            setAuthStatus('connected');
            await loadSettings();
          }
        } catch {
          // ignore
        }
      }, 2000);
    } catch (e) {
      setAuthError(String(e));
      setAuthStatus('error');
      setTimeout(() => setAuthStatus('idle'), 5000);
    }
  }

  async function handleDisconnect() {
    await invoke('disconnect_github');
    setSettings(prev => {
      const next = { ...prev };
      delete next.github_username;
      delete next.github_avatar_url;
      return next;
    });
    setAuthStatus('idle');
  }

  async function handleForceSync() {
    setSyncing(true);
    setSyncResult('');
    try {
      const result = await invoke<string>('force_sync');
      setSyncResult(result);
    } catch (e) {
      setSyncResult(`Error: ${e}`);
    }
    setSyncing(false);
  }

  const isConnected = authStatus === 'connected';

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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, position: 'relative', zIndex: 2 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ui.textMuted, fontSize: 14, fontWeight: 800, padding: '4px 4px' }}>←</button>
          <HeaderTitle>Settings</HeaderTitle>
          <div style={{ width: 28 }} />
        </div>

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>
            Tune Vigil
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.46)', lineHeight: 1.3, fontWeight: 700 }}>
            GitHub sync, filtering, and menu bar behavior.
          </div>
        </div>
      </div>

      <div style={{ ...contentStyle, padding: '8px 14px 14px', flex: 1 }}>

        {/* GitHub Connection */}
        <Section title="GitHub Connection">
          {isConnected ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {settings.github_avatar_url && (
                  <img src={settings.github_avatar_url} alt="" style={{ width: 32, height: 32, borderRadius: 0, border: '2px solid rgba(255,255,255,0.15)' }} />
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>
                    {settings.github_username || 'Unknown'}
                  </div>
                  <div style={{ fontSize: 10, color: ui.green, fontWeight: 700 }}>
                    Connected via OAuth
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', width: 9, height: 9, borderRadius: 0, background: ui.green }} />
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <button
                  onClick={onManageRepos}
                  style={{
                    padding: '7px 13px', borderRadius: 0, fontSize: 11, fontWeight: 800,
                    background: ui.surfaceElevated, color: ui.text,
                    border: `1px solid ${ui.borderStrong}`,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                  }}
                >
                  Manage Repos
                </button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleDisconnect}
                  style={{
                    padding: '7px 13px', borderRadius: 0, fontSize: 11, fontWeight: 800,
                    background: 'rgba(255,59,48,0.15)', color: '#ff3b30',
                    border: '1px solid rgba(255,59,48,0.3)',
                  }}
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : authStatus === 'awaiting_user' || authStatus === 'polling' || authStatus === 'connecting' ? (
            <div>
              {deviceFlow && (
                <div style={{ padding: 12, borderRadius: 0, background: 'rgba(255,255,255,0.08)', marginBottom: 8, border: `1px solid ${ui.border}` }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Enter this code on GitHub:</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '0.1em', fontFamily: 'monospace', textAlign: 'center', padding: '8px 0' }}>
                    {deviceFlow.user_code}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>
                    {deviceFlow.verification_uri}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 12, color: ui.yellow, marginBottom: 4, fontWeight: 800 }}>
                ⏳ Waiting for GitHub authorization...
              </div>
              <div style={{ fontSize: 10, color: ui.textFaint, fontWeight: 700 }}>
                Complete the authorization in your browser. Polling continues in the background.
              </div>
            </div>
          ) : authStatus === 'error' ? (
            <div>
              <div style={{ fontSize: 11, color: '#ff3b30', marginBottom: 6 }}>{authError}</div>
              <button onClick={handleConnect} style={connectBtnStyle}>Retry Connection</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginBottom: 8, lineHeight: 1.4, fontWeight: 700 }}>
                Connect your GitHub account to start monitoring repositories.
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 4 }}>
                  GitHub OAuth Client ID
                </label>
                <input
                  value={settings.github_client_id || ''}
                  onChange={(e) => updateSetting('github_client_id', e.target.value)}
                  placeholder="Iv1xxxxxxxxxxxx"
                  style={{
                  width: '100%', padding: '9px 11px', borderRadius: 0, border: `1px solid ${ui.border}`,
                    background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12, fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
              </div>
              <button onClick={handleConnect} disabled={!settings.github_client_id} style={{
                ...connectBtnStyle,
                opacity: !settings.github_client_id ? 0.4 : 1,
                cursor: !settings.github_client_id ? 'not-allowed' : 'pointer',
              }}>
                Connect with GitHub
              </button>
            </div>
          )}
        </Section>

        {/* Polling */}
        <Section title="Polling">
          <SkeuomorphicSlider
            min={30}
            max={300}
            step={30}
            value={parseInt(settings.poll_interval_s || '60')}
            onChange={(v) => updateSetting('poll_interval_s', String(v))}
            label="Check interval"
            unit="s"
          />
          {isConnected && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={handleForceSync}
                disabled={syncing}
                style={{
                  padding: '7px 14px', borderRadius: 0, fontSize: 11, fontWeight: 800,
                  background: syncing ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)',
                  color: syncing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
                  border: '1px solid rgba(255,255,255,0.15)',
                }}
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              {syncResult && (
                <div
                  style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.4)',
                    marginTop: 6,
                    lineHeight: 1.35,
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {syncResult}
                </div>
              )}
            </div>
          )}
        </Section>

      </div>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...glassPanelStyle, marginBottom: 10, padding: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.36)', letterSpacing: 0, marginBottom: 10, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function RadioGroup({ options, selected, onChange }: {
  options: { value: string; label: string }[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            minHeight: 28,
            padding: '6px 12px',
            borderRadius: 0,
            fontSize: 11,
            fontWeight: 800,
            background: opt.value === selected ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.055)',
            color: opt.value === selected ? '#fff' : 'rgba(255,255,255,0.5)',
            border: opt.value === selected ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.05)',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', fontWeight: 800 }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 42,
          height: 24,
          borderRadius: 0,
          background: value ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.15)',
          position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 0,
            background: value ? '#fff' : 'rgba(255,255,255,0.3)',
            position: 'absolute',
            top: 3,
            left: value ? 22 : 3,
            transition: 'left 0.2s',
          }}
        />
      </button>
    </div>
  );
}

const connectBtnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 0, fontSize: 11, fontWeight: 900,
  background: 'rgba(255,255,255,0.14)', color: '#fff',
  border: '1px solid rgba(255,255,255,0.16)',
};
