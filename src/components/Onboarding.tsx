import React, { useState, useEffect, useRef } from 'react';
import { invoke, openUrl, ERR_NOT_IN_TAURI } from '../tauri';
import { HeaderTitle, panelStyle, primaryButtonStyle, secondaryButtonStyle, shellStyle, ui } from './design';

interface DeviceFlowInfo {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
}

type WizardStep = 'open_github' | 'checklist' | 'paste_id' | 'authorizing' | 'done' | 'error';

interface Props {
  onConnected: () => void;
  compact?: boolean;
}

const GITHUB_APP_URL = 'https://github.com/settings/applications/new';

const stepStyles: React.CSSProperties = { animation: 'fadeSlideIn 0.25s ease-out' };

export const Onboarding: React.FC<Props> = ({ onConnected, compact = false }) => {
  const [step, setStep] = useState<WizardStep>('open_github');
  const [flow, setFlow] = useState<DeviceFlowInfo | null>(null);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (step === 'paste_id') {
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement>('#client-id-input');
        el?.focus();
      }, 150);
    }
  }, [step]);

  useEffect(() => {
    invoke<boolean>('get_pending_auth').then((pending) => {
      if (pending) { setStep('authorizing'); startAuthPoll(); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const unsub = await listen('auth-complete', () => {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setStep('done');
          setTimeout(() => onConnected(), 800);
        });
        unlisten = unsub;
      } catch { /* ignore */ }
    };
    setup();
    return () => { unlisten?.(); };
  }, [onConnected]);

  function startAuthPoll() {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const authed = await invoke<boolean>('is_authenticated');
        if (authed) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setStep('done');
          setTimeout(() => onConnected(), 800);
        }
      } catch { /* ignore */ }
    }, 2000);
  }

  async function handleConnect() {
    const trimmed = clientId.trim();
    if (!trimmed) return;
    setConnecting(true);
    await invoke('update_setting', { key: 'github_client_id', value: trimmed });
    try {
      const result = await invoke<DeviceFlowInfo>('start_auth');
      setFlow(result);
      setStep('authorizing');
      openUrl(result.verification_uri);
      startAuthPoll();
    } catch (e: unknown) {
      const msg = (e instanceof Error) ? e.message : String(e);
      setError(msg);
      setStep('error');
    } finally {
      setConnecting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 0,
    border: `1px solid ${ui.border}`,
    background: ui.glass,
    color: '#fff',
    fontSize: 13,
    fontFamily: 'monospace',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const isValid = clientId.trim().length >= 8;

  return (
    <div style={{ ...shellStyle(compact ? 300 : 340, compact ? 360 : 560), height: compact ? 360 : undefined }} key={step}>
      <div style={{ ...panelStyle(compact), flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div data-tauri-drag-region style={{
          display: 'flex', alignItems: 'center', marginBottom: compact ? 12 : 16,
          position: 'relative', zIndex: 2, cursor: 'grab',
        }}>
          <HeaderTitle drag={compact}>Vigil</HeaderTitle>
        </div>

        <div style={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>

        {/* Step 1: Open GitHub */}
        {step === 'open_github' && (
          <div style={{ ...stepStyles, textAlign: 'center', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}>
            <GitHubLogo />
            <div style={{ fontSize: compact ? 20 : 24, fontWeight: 900, color: '#fff', lineHeight: 1.1, marginBottom: 6 }}>
              Connect GitHub
            </div>
            <div style={{ fontSize: compact ? 10 : 12, color: ui.textMuted, lineHeight: 1.35, fontWeight: 700, marginBottom: 18, padding: '0 8px' }}>
              Vigil is a desktop app. GitHub requires a one-time OAuth App setup so you own your credentials.
            </div>
            <button
              onClick={() => { openUrl(GITHUB_APP_URL); setStep('checklist'); }}
              style={{ ...primaryButtonStyle, fontSize: 13, minHeight: 44 }}
            >
              Open GitHub → Step 1 of 3
            </button>
            <div style={{ fontSize: 9, color: ui.textFaint, marginTop: 10 }}>
              Opens the OAuth App creation page
            </div>
          </div>
        )}

        {/* Step 2: Checklist */}
        {step === 'checklist' && (
          <div style={{ ...stepStyles, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: compact ? 16 : 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                Fill in the form
              </div>
              <div style={{ fontSize: 10, color: ui.textMuted, marginBottom: 12, fontWeight: 700 }}>
                Step 2 of 3 — exact values for each field:
              </div>
              <FieldRow label="Application name" value="Vigil" />
              <FieldRow label="Homepage URL" value="http://localhost:1420" />
              <FieldRow label="Authorization callback URL" value="http://localhost:1420" />
              <FieldRow label="Device Flow" value="Enable (checkbox)" />
            </div>
            <div style={{ paddingTop: 10 }}>
              <button onClick={() => setStep('paste_id')} style={secondaryButtonStyle}>
                ← Back
              </button>
              <div style={{ height: 6 }} />
              <button onClick={() => setStep('paste_id')} style={{ ...primaryButtonStyle, fontSize: 12 }}>
                Done filling → Step 3 of 3
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Paste Client ID */}
        {step === 'paste_id' && (
          <div style={{ ...stepStyles, display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ fontSize: compact ? 16 : 18, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                Paste your Client ID
              </div>
              <div style={{ fontSize: 10, color: ui.textMuted, marginBottom: 12, fontWeight: 700 }}>
                Step 3 of 3 — find it on the GitHub page after registering
              </div>
              <input
                id="client-id-input"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && isValid) handleConnect(); }}
                    placeholder="Paste Client ID from GitHub"
                style={inputStyle}
              />
              {clientId.trim() && !isValid && (
                <div style={{ fontSize: 9, color: '#ff5a68', marginTop: 4, fontWeight: 700 }}>
                  Client ID is too short. Check your clipboard.
                </div>
              )}
              {isValid && (
                <div style={{ fontSize: 9, color: ui.green, marginTop: 4, fontWeight: 700 }}>
                  ✓ Ready to connect
                </div>
              )}
            </div>
            <div style={{ paddingTop: 10 }}>
              <button onClick={() => setStep('checklist')} style={secondaryButtonStyle}>
                ← Back
              </button>
              <div style={{ height: 6 }} />
              <button
                onClick={handleConnect}
                disabled={!isValid || connecting}
                style={{
                  ...primaryButtonStyle,
                  opacity: isValid ? 1 : 0.3,
                  cursor: isValid ? 'pointer' : 'not-allowed',
                }}
              >
                {connecting ? 'Connecting...' : 'Connect →'}
              </button>
              <div style={{ fontSize: 9, color: ui.textFaint, textAlign: 'center', marginTop: 6 }}>
                Vigil stores your Client ID locally. You own the app.
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Authorizing */}
        {step === 'authorizing' && flow && (
          <div style={{ textAlign: 'center', ...stepStyles }}>
            <div style={{ fontSize: 11, color: ui.textMuted, marginBottom: 4, fontWeight: 800 }}>
              Authorize Vigil on GitHub
            </div>
            <div style={{
              fontSize: 36, fontWeight: 900, color: '#fff',
              letterSpacing: '0.12em', fontFamily: 'monospace',
              padding: '16px 0', marginBottom: 2,
            }}>
              {flow.user_code}
            </div>
            <div
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.36)', marginBottom: 16, textDecoration: 'underline', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => openUrl(flow.verification_uri)}
            >
              {flow.verification_uri}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 800 }}>
              <PulsingDot />
              Waiting for authorization...
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 12, fontWeight: 700 }}>
              Browser opened. Polling continues even if this window closes.
            </div>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div style={{ textAlign: 'center', ...stepStyles }}>
            <div style={{ fontSize: 11, color: '#ff5a68', marginBottom: 12, lineHeight: 1.4, fontWeight: 700, whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
            <button onClick={() => { setStep('paste_id'); setError(''); }} style={secondaryButtonStyle}>
              Try Again
            </button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: 16, ...stepStyles }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>Connected!</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginTop: 4, fontWeight: 700 }}>
              Fetching your repositories...
            </div>
          </div>
        )}
      </div>
      </div>
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
};

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 10px', marginBottom: 2,
      background: ui.surface, border: `1px solid ${ui.border}`,
      fontSize: 10,
    }}>
      <span style={{ color: ui.textMuted, fontWeight: 700 }}>{label}</span>
      <span style={{ color: ui.text, fontFamily: 'monospace', fontWeight: 800, fontSize: 9 }}>{value}</span>
    </div>
  );
}

function GitHubLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)" style={{ marginBottom: 12 }}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
    </svg>
  );
}

function PulsingDot() {
  return (
    <div style={{
      width: 6, height: 6, borderRadius: 0,
      backgroundColor: '#34c759',
      animation: 'pulse 2s ease-in-out infinite',
    }} />
  );
}
