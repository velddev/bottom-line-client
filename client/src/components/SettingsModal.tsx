import { useEffect, useState } from 'react';
import { X, Sun, Moon, Paintbrush, KeyRound, Copy, Check, Eye, EyeOff, MessageCircle } from 'lucide-react';
import { useTheme, type ColorMode } from '../hooks/useTheme';
import { useAuth } from '../auth';

// ── Vertical nav ─────────────────────────────────────────────────────────────
type SettingsTab = 'appearance' | 'account';

interface NavItem {
  value: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { value: 'appearance', label: 'Appearance', icon: <Paintbrush size={14} /> },
  { value: 'account',   label: 'Account',    icon: <KeyRound    size={14} /> },
];

function SideNav({ active, onChange }: { active: SettingsTab; onChange: (v: SettingsTab) => void }) {
  return (
    <nav className="w-36 shrink-0 border-r border-gray-300 py-3 flex flex-col gap-0.5">
      {NAV.map(({ value, label, icon }) => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={`
            w-full flex items-center gap-2.5 pl-4 pr-3 py-2 text-xs font-medium
            border-l-2 transition-colors text-left
            ${active === value
              ? 'border-indigo-500 bg-gray-200/60 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-200/40'}
          `.replace(/\s+/g, ' ').trim()}
        >
          <span className="shrink-0">{icon}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}

// ── Appearance tab ────────────────────────────────────────────────────────────
function PaletteStrip({ dark }: { dark: boolean }) {
  const swatches = dark
    ? ['#1c1917', '#292524', '#3c3734', '#f59e0b', '#34d399', '#fb7185']
    : ['#f5f5f4', '#e7e5e4', '#d6d3d1', '#b45309', '#059669', '#e11d48'];
  return (
    <div className="flex gap-1 mt-2.5">
      {swatches.map((c) => (
        <span key={c} className="w-4 h-3 rounded-sm" style={{ background: c }} />
      ))}
    </div>
  );
}

function ModeCard({ value, label, icon, active, onSelect }: {
  value: ColorMode; label: string; icon: React.ReactNode;
  active: boolean; onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={active}
      className={`
        flex-1 flex flex-col items-start px-3.5 pt-3 pb-3.5 rounded-lg border transition-all
        ${active
          ? 'border-indigo-500 bg-gray-200/60'
          : 'border-gray-300 hover:border-gray-400 bg-gray-200/30'}
      `.replace(/\s+/g, ' ').trim()}
    >
      <div className="flex items-center justify-between w-full">
        <span className={`transition-colors ${active ? 'text-indigo-400' : 'text-gray-500'}`}>
          {icon}
        </span>
        {active && <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />}
      </div>
      <span className={`text-xs font-medium mt-2 ${active ? 'text-gray-900' : 'text-gray-600'}`}>
        {label}
      </span>
      <PaletteStrip dark={value === 'dark'} />
    </button>
  );
}

function AppearanceTab() {
  const { mode, applyMode } = useTheme();
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">Color Mode</p>
        <div className="flex gap-2.5">
          <ModeCard value="dark"  label="Dark"  icon={<Moon size={15} />} active={mode === 'dark'}  onSelect={() => applyMode('dark')}  />
          <ModeCard value="light" label="Light" icon={<Sun  size={15} />} active={mode === 'light'} onSelect={() => applyMode('light')} />
        </div>
      </div>
    </div>
  );
}

// ── Account tab ───────────────────────────────────────────────────────────────
function CopyField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [copied,   setCopied]   = useState(false);
  const [revealed, setRevealed] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5 bg-gray-200 border border-gray-300 rounded px-2.5 py-1.5">
        <span className="font-mono text-[11px] text-gray-700 flex-1 truncate select-all">
          {secret && !revealed ? '•'.repeat(Math.min(value.length, 28)) : value}
        </span>
        {secret && (
          <button
            onClick={() => setRevealed((v) => !v)}
            title={revealed ? 'Hide' : 'Reveal'}
            className="text-gray-400 hover:text-gray-700 transition-colors shrink-0"
          >
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}
        <button
          onClick={copy}
          title="Copy to clipboard"
          className="text-gray-400 hover:text-gray-700 transition-colors shrink-0"
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

function AccountTab() {
  const { auth } = useAuth();
  if (!auth) return <p className="text-xs text-gray-500">Not logged in.</p>;

  return (
    <div className="space-y-3.5">
      <CopyField label="Username"  value={auth.username}  />
      <CopyField label="Player ID" value={auth.player_id} />
      <CopyField label="City ID"   value={auth.city_id}   />
      <CopyField label="API Key"   value={auth.api_key}   secret />
      <p className="text-[10px] text-gray-500 pt-1">
        Your API key grants full account access. Keep it private.
      </p>
    </div>
  );
}

// ── SettingsModal ─────────────────────────────────────────────────────────────
/**
 * Multi-section settings overlay with vertical sidebar navigation.
 * Opened via the gear icon in the nav bar.
 *
 * @example
 * {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
 */
export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>('appearance');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg mx-4 bg-gray-100 border border-gray-200 rounded-xl shadow-overlay flex overflow-hidden"
        style={{ height: 340 }}
        role="dialog"
        aria-modal="true"
      >
        {/* Vertical nav */}
        <SideNav active={tab} onChange={setTab} />

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-5 min-h-0">
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'account'    && <AccountTab />}
          </div>

          {/* Discord community link */}
          <div className="border-t border-gray-300 px-5 py-3">
            <a
              href="https://discord.gg/eNc7d9Z5eu"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-indigo-500 transition-colors"
            >
              <MessageCircle size={14} />
              <span>Join our Community!</span>
            </a>
          </div>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-900 transition-colors p-1 rounded"
          style={{ position: 'absolute' }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

