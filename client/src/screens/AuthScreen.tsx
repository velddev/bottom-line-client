import { useEffect, useRef, useState } from 'react';
import { getProfile, useApi } from '../api';
import { useAuth } from '../auth';
import { isDiscordActivity, getDiscordActivityCode } from '../discord-activity';

type Step =
  | { kind: 'idle' }
  | { kind: 'waiting-for-code' }    // Discord browser opened, waiting for deep-link code
  | { kind: 'pick-username' }       // code received — now choose a handle
  | { kind: 'exchanging' }          // exchanging code with server
  | { kind: 'manual' };             // manual credential entry (returning players)

export default function AuthScreen() {
  const { login } = useAuth();
  const api = useApi();

  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Manual login state
  const [manualPlayerId, setManualPlayerId]   = useState('');
  const [manualApiKey, setManualApiKey]       = useState('');
  const [manualCityId, setManualCityId]       = useState('');
  const [manualUsername, setManualUsername]   = useState('');

  // ── Discord Activity auto-login ───────────────────────────────────────────
  // When running inside Discord's Activity iframe, skip the login UI and
  // authenticate directly via the Embedded App SDK.
  useEffect(() => {
    if (!isDiscordActivity()) return;

    let cancelled = false;
    setStep({ kind: 'exchanging' });

    (async () => {
      try {
        const { methods } = await api.getAuthMethods();
        const discord = methods.find((m) => m.provider === 'discord');
        if (!discord) throw new Error('Discord login is not configured on this server.');

        const code = await getDiscordActivityCode(discord.client_id);
        if (cancelled) return;

        // The redirect URI must be registered in the Discord Developer Portal
        // for this application: https://discord.com/games/<application_id>
        const redirectUri = `https://discord.com/games/${discord.client_id}`;
        const result = await api.exchangeOAuthCode('DISCORD', code, redirectUri);
        localStorage.setItem('api_key', result.api_key);
        const profile = await getProfile();
        if (cancelled) return;

        login({
          player_id: result.player_id,
          api_key:   result.api_key,
          city_id:   profile.city_id,
          username:  profile.username,
        });
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setStep({ kind: 'idle' });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [api, login]);

  // Capture pending code + redirect URI for use after the OAuth callback
  const pendingCode        = useRef('');
  const pendingRedirectUri = useRef('');

  // Listen for the ventured://auth deep-link code from Electron main process
  useEffect(() => {
    if (!window.electronAPI?.onDiscordAuth) return;
    const stop = window.electronAPI.onDiscordAuth(({ code }) => {
      pendingCode.current        = code;
      pendingRedirectUri.current = 'https://api.ventured.gg/v1/auth/callback';
      setUsername('');
      setError(null);
      setStep({ kind: 'pick-username' });
    });
    return stop;
  }, []);

  // Called once the user submits their chosen handle (after Discord OAuth)
  const handleFinishLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep({ kind: 'exchanging' });
    setError(null);
    try {
      const result = await api.exchangeOAuthCode(
        'DISCORD', pendingCode.current, pendingRedirectUri.current, username.trim());
      localStorage.setItem('api_key', result.api_key);
      const profile = await getProfile();
      login({
        player_id: result.player_id,
        api_key:   result.api_key,
        city_id:   profile.city_id,
        username:  profile.username,
      });
    } catch (err) {
      setError((err as Error).message);
      setStep({ kind: 'pick-username' });
    }
  };

  // ── Step: idle — show main login button ──────────────────────────────────
  if (step.kind === 'idle') {
    const handleDiscordLogin = async () => {
      setError(null);
      try {
        const { methods } = await api.getAuthMethods();
        const discord = methods.find((m) => m.provider === 'discord');
        if (!discord) { setError('Discord login is not configured on this server.'); return; }

        const result = await api.openDiscordOAuth(discord.client_id);
        if (result.code) {
          // Web popup path: code returned directly alongside the redirect URI used
          pendingCode.current        = result.code;
          pendingRedirectUri.current = result.redirectUri;
          setUsername('');
          setError(null);
          setStep({ kind: 'pick-username' });
        } else {
          // Electron deep-link path: code arrives later via IPC
          setStep({ kind: 'waiting-for-code' });
        }
      } catch (err) {
        setError((err as Error).message);
      }
    };

    return (
      <LoginShell error={error}>
        <button
          onClick={handleDiscordLogin}
          className="w-full flex items-center justify-center gap-3 bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 rounded-xl text-sm font-semibold transition-colors"
        >
          <DiscordIcon />
          Login with Discord
        </button>

        <div className="flex items-center gap-2 my-2">
          <div className="flex-1 h-px bg-stone-700" />
          <span className="text-xs text-stone-600">or</span>
          <div className="flex-1 h-px bg-stone-700" />
        </div>

        <button
          onClick={() => { setError(null); setStep({ kind: 'manual' }); }}
          className="w-full text-xs text-stone-500 hover:text-stone-300 py-2 transition-colors"
        >
          Enter credentials manually
        </button>
      </LoginShell>
    );
  }

  // ── Step: pick-username — Discord approved, now choose a handle ───────────
  if (step.kind === 'pick-username') {
    return (
      <LoginShell error={error}>
        <form onSubmit={handleFinishLogin} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1 uppercase tracking-wider">
              Choose a username
            </label>
            <input
              autoFocus
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-indigo-500"
              placeholder="your_handle  (leave blank to use Discord name)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Only matters for new accounts. Returning players keep their existing name.
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-sm font-semibold transition-colors"
          >
            Enter Game →
          </button>

          <button
            type="button"
            onClick={() => setStep({ kind: 'idle' })}
            className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 transition-colors"
          >
            ← Back
          </button>
        </form>
      </LoginShell>
    );
  }

  // ── Step: waiting-for-code ────────────────────────────────────────────────
  if (step.kind === 'waiting-for-code') {
    return (
      <LoginShell>
        <div className="text-center space-y-3 py-4">
          <p className="text-gray-700 text-sm">Waiting for Discord authorization…</p>
          <p className="text-gray-500 text-xs">
            Approve in the browser window that opened, then return here.
          </p>
          <button
            onClick={() => setStep({ kind: 'idle' })}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </LoginShell>
    );
  }

  // ── Step: exchanging ──────────────────────────────────────────────────────
  if (step.kind === 'exchanging') {
    return (
      <LoginShell>
        <div className="text-center py-4">
          <p className="text-gray-600 text-sm">Signing in…</p>
        </div>
      </LoginShell>
    );
  }

  // ── Step: manual ──────────────────────────────────────────────────────────
  function handleManualLogin(e: React.FormEvent) {
    e.preventDefault();
    login({
      player_id: manualPlayerId.trim(),
      api_key:   manualApiKey.trim(),
      city_id:   manualCityId.trim(),
      username:  manualUsername.trim(),
    });
  }

  return (
    <LoginShell error={error}>
      <form onSubmit={handleManualLogin} className="space-y-4">
        {([
          ['Username',  manualUsername,  setManualUsername  ],
          ['Player ID', manualPlayerId,  setManualPlayerId  ],
          ['API Key',   manualApiKey,    setManualApiKey    ],
          ['City ID',   manualCityId,    setManualCityId    ],
        ] as [string, string, (v: string) => void][]).map(([label, val, set]) => (
          <div key={label}>
            <label className="block text-xs text-gray-600 mb-1 uppercase tracking-wider">{label}</label>
            <input
              className="w-full bg-gray-100 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-indigo-500 font-mono"
              value={val}
              onChange={(e) => set(e.target.value)}
              required
            />
          </div>
        ))}
        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-gray-900 py-2.5 rounded-xl text-sm font-bold transition-colors"
        >
          Enter Game
        </button>
        <button
          type="button"
          onClick={() => setStep({ kind: 'idle' })}
          className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 transition-colors"
        >
          ← Back
        </button>
      </form>
    </LoginShell>
  );
}

// ── Shared shell ─────────────────────────────────────────────────────────────

function LoginShell({ children, error }: { children: React.ReactNode; error?: string | null }) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 relative overflow-hidden">

      {/* Subtle grid — decorative only */}
      <div className="absolute inset-0 opacity-[0.06]" style={{
        backgroundImage: 'linear-gradient(#d97706 1px, transparent 1px), linear-gradient(90deg, #d97706 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      {/* Centre glow — decorative only */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse 70% 45% at 50% 50%, rgba(217,119,6,0.10) 0%, transparent 70%)',
      }} />

      {/* Content */}
      <div className="relative w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-10">
          <div className="mb-2 flex items-baseline justify-center gap-2">
            <span className="text-5xl font-extrabold tracking-widest text-indigo-400">
              VENTURED
            </span>
          </div>
          <p className="text-gray-500 text-[10px] tracking-[0.4em] uppercase">Open World Economy</p>
        </div>

        {/* Card */}
        <div className="bg-gray-200 border border-gray-300 rounded-2xl p-7 shadow-panel space-y-4">
          {error && (
            <p className="text-rose-400 text-xs bg-rose-900/20 border border-rose-900/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {children}
        </div>

        <p className="text-center text-gray-500 text-[10px] tracking-widest uppercase mt-6">
          Season 1 · Alpha
        </p>
      </div>
    </div>
  );
}

function DiscordIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.014.043.031.055a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}

