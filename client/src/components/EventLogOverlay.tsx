import { useEffect, useRef, useState } from 'react';
import { Radio, X, ChevronDown, Filter } from 'lucide-react';
import type { GameEvent } from '../types';
import { fmtMoney } from '../types';
import { api } from '../api';

// ── Helpers ────────────────────────────────────────────────────────────────────
function shortId(id: string) {
  return id.slice(0, 6).toUpperCase();
}

function pct(a: number, b: number) {
  if (a === 0) return '—';
  const d = ((b - a) / a) * 100;
  return `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`;
}

function qualityBar(q: number) {
  const filled = Math.min(5, Math.round(q * 2));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

// ── Event categories for badge + filter ───────────────────────────────────────
type Category = 'economy' | 'production' | 'market' | 'politics' | 'world' | 'social' | 'system';

interface EventEntry {
  icon: string;
  category: Category;
  headline: string;
  detail?: string;
  cls: string;
}

const CATEGORY_BADGE: Record<Category, { label: string; cls: string }> = {
  economy:    { label: 'Economy',    cls: 'bg-emerald-900/60 text-emerald-400' },
  production: { label: 'Production', cls: 'bg-slate-100 text-slate-700' },
  market:     { label: 'Market',     cls: 'bg-amber-900/50 text-amber-400' },
  politics:   { label: 'Politics',   cls: 'bg-purple-900/50 text-purple-400' },
  world:      { label: 'World',      cls: 'bg-indigo-900/50 text-indigo-400' },
  social:     { label: 'Social',     cls: 'bg-gray-100 text-gray-700' },
  system:     { label: 'System',     cls: 'bg-white text-gray-600' },
};

function describe(e: GameEvent): EventEntry {
  if (e.tick_completed) {
    return {
      icon: '🕐', category: 'system',
      headline: `Tick ${e.tick} processed`,
      cls: 'text-gray-500',
    };
  }

  if (e.resource_produced) {
    const { resource_type, quantity, quality } = e.resource_produced;
    const cap = resource_type.charAt(0).toUpperCase() + resource_type.slice(1);
    return {
      icon: '🏭', category: 'production',
      headline: `${cap} produced`,
      detail: `${quantity.toFixed(2)} units · Quality ${quality.toFixed(2)} ${qualityBar(quality)}`,
      cls: 'text-slate-700',
    };
  }

  if (e.trade_completed) {
    const { resource_type, quantity, total_price, buyer_building_id, seller_building_id } = e.trade_completed;
    const cap = resource_type.charAt(0).toUpperCase() + resource_type.slice(1);
    const unit = total_price / Math.max(quantity, 0.001);
    return {
      icon: '💰', category: 'economy',
      headline: `${cap} traded — ${fmtMoney(total_price)}`,
      detail: `${quantity.toFixed(2)} units · ${fmtMoney(unit)}/unit · Buyer ${shortId(buyer_building_id)} ← Seller ${shortId(seller_building_id)}`,
      cls: 'text-emerald-400',
    };
  }

  if (e.market_price_changed) {
    const { resource_type, old_median_price: old, new_median_price: nw } = e.market_price_changed;
    const dir = nw > old ? '↑' : '↓';
    const change = pct(old, nw);
    const cap = resource_type.charAt(0).toUpperCase() + resource_type.slice(1);
    return {
      icon: nw > old ? '📈' : '📉', category: 'market',
      headline: `${cap} price ${dir} ${change}`,
      detail: `${fmtMoney(old)} → ${fmtMoney(nw)} median`,
      cls: nw > old ? 'text-emerald-400' : 'text-rose-400',
    };
  }

  if (e.building_constructed) {
    const { building_type, building_id, player_id, building_name } = e.building_constructed;
    const cap = building_type.charAt(0).toUpperCase() + building_type.slice(1);
    const label = building_name || `${cap} #${shortId(building_id)}`;
    return {
      icon: '🏗️', category: 'world',
      headline: `${label} construction complete`,
      detail: `${cap} · Owner ${shortId(player_id)}`,
      cls: 'text-indigo-300',
    };
  }

  if (e.building_construction_started) {
    const { building_type, building_id, player_id, building_name, construction_ticks_remaining } = e.building_construction_started;
    const cap = building_type.charAt(0).toUpperCase() + building_type.slice(1);
    const label = building_name || `${cap} #${shortId(building_id)}`;
    return {
      icon: '⚒️', category: 'world',
      headline: `${label} — construction started`,
      detail: `${cap} · Ready in ${construction_ticks_remaining} tick${construction_ticks_remaining !== 1 ? 's' : ''} · Owner ${shortId(player_id)}`,
      cls: 'text-cyan-300',
    };
  }

  if (e.building_status_changed) {
    const { building_name, building_type, old_status, new_status } = e.building_status_changed;
    const isBad = new_status === 'MissingResources' || new_status === 'Paused';
    const isGood = new_status === 'Producing';
    const statusLabel: Record<string, string> = {
      Producing: '▶ Producing', Idle: '⏸ Idle',
      MissingResources: '⚠️ Missing Resources', Paused: '🚫 Paused',
    };
    const label = building_name || building_type;
    return {
      icon: isBad ? '⚠️' : isGood ? '✅' : '🔄', category: 'production',
      headline: `${label} — ${statusLabel[new_status] ?? new_status}`,
      detail: `Was ${old_status} · ${building_type}`,
      cls: isBad ? 'text-rose-400' : isGood ? 'text-emerald-400' : 'text-gray-600',
    };
  }

  if (e.election_announced) {
    const { voting_start_tick } = e.election_announced;
    const ticksUntil = voting_start_tick - e.tick;
    return {
      icon: '🗳️', category: 'politics',
      headline: 'Election season begins',
      detail: `Campaign phase • Voting starts in ${ticksUntil} tick${ticksUntil !== 1 ? 's' : ''} (tick ${voting_start_tick})`,
      cls: 'text-amber-400',
    };
  }

  if (e.election_concluded) {
    const winnerId = e.election_concluded.winner_player_id;
    return {
      icon: '🏛️', category: 'politics',
      headline: 'Election concluded',
      detail: winnerId
        ? `Winner: ${shortId(winnerId)} elected as mayor`
        : 'No winner — incumbent retains office',
      cls: 'text-purple-400',
    };
  }

  if (e.agreement_changed) {
    const { agreement_id, new_status, creator_player_id, buyer_player_id } = e.agreement_changed;
    const statusColors: Record<string, string> = {
      Active: 'text-emerald-400', Cancelled: 'text-rose-400',
      Pending: 'text-amber-400', Expired: 'text-gray-500',
    };
    return {
      icon: '🤝', category: 'economy',
      headline: `Agreement ${new_status}`,
      detail: `ID ${shortId(agreement_id)} · Creator ${shortId(creator_player_id)} → Buyer ${shortId(buyer_player_id)}`,
      cls: statusColors[new_status] ?? 'text-blue-300',
    };
  }

  if (e.brand_value_changed) {
    const { resource_category, old_weight: old, new_weight: nw } = e.brand_value_changed;
    const dir = nw > old ? '↑' : '↓';
    const change = pct(old, nw);
    const cap = resource_category.charAt(0).toUpperCase() + resource_category.slice(1);
    return {
      icon: '📣', category: 'market',
      headline: `${cap} brand weight ${dir} ${change}`,
      detail: `${old.toFixed(3)} → ${nw.toFixed(3)} brand influence`,
      cls: nw > old ? 'text-pink-300' : 'text-pink-500',
    };
  }

  if (e.taxes_collected) {
    const { total_collected } = e.taxes_collected;
    return {
      icon: '💸', category: 'economy',
      headline: 'Tax revenue collected',
      detail: `${fmtMoney(total_collected)} deposited to government treasury`,
      cls: 'text-orange-400',
    };
  }

  if (e.tile_changed) {
    const { grid_x, grid_y, owner_name, building_name, building_type, building_status, is_for_sale, purchase_price } = e.tile_changed;
    let headline = `Tile (${grid_x},${grid_y}) updated`;
    let detail = '';
    if (building_name) {
      headline = `${building_name} — ${building_status.toLowerCase()}`;
      detail = `${building_type} at (${grid_x},${grid_y}) · Owner: ${owner_name || 'Government'}`;
    } else if (is_for_sale) {
      headline = `Tile (${grid_x},${grid_y}) listed for sale`;
      detail = `${fmtMoney(purchase_price)} · Owner: ${owner_name || 'Government'}`;
    } else {
      detail = `Owner: ${owner_name || 'Government'}`;
    }
    return {
      icon: '🗺️', category: 'world',
      headline,
      detail,
      cls: 'text-cyan-400',
    };
  }

  if (e.chat_message) {
    const { from_player_name, to_player_id, to_player_name, content } = e.chat_message;
    const isDm = !!to_player_id;
    return {
      icon: isDm ? '💬' : '🗣️', category: 'social',
      headline: isDm ? `DM: ${from_player_name} → ${to_player_name}` : `${from_player_name}`,
      detail: content,
      cls: isDm ? 'text-indigo-300' : 'text-gray-700',
    };
  }

  return {
    icon: '•', category: 'system',
    headline: 'Unknown event',
    cls: 'text-gray-700',
  };
}

// ── Filter options ─────────────────────────────────────────────────────────────
const FILTERS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all',        label: 'All'        },
  { value: 'economy',    label: 'Economy'    },
  { value: 'production', label: 'Production' },
  { value: 'market',     label: 'Market'     },
  { value: 'politics',   label: 'Politics'   },
  { value: 'world',      label: 'World'      },
  { value: 'social',     label: 'Chat'       },
];

// ── Component ──────────────────────────────────────────────────────────────────
export default function EventLogOverlay({ cityId, apiKey }: { cityId: string; apiKey: string }) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [showFilter, setShowFilter] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!cityId || !apiKey) return;
    const unsub = api.subscribeToEvents(
      cityId, apiKey,
      (ev) => setEvents((prev) => [ev, ...prev].slice(0, 300)),
      () => setConnected(true),
      () => setConnected(false),
    );
    return () => { unsub(); setConnected(false); };
  }, [cityId, apiKey]);

  useEffect(() => {
    if (!open) {
      const n = events.length - prevCountRef.current;
      if (n > 0) setUnread((u) => u + n);
    }
    prevCountRef.current = events.length;
  }, [events.length, open]);

  useEffect(() => { if (open) setUnread(0); }, [open]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = 0;
  }, [events.length, open]);

  const displayed = filter === 'all'
    ? events
    : events.filter((e) => describe(e).category === filter);

  return (
    <div className="absolute bottom-4 right-4 z-[1001] flex flex-col items-end">
      {open && (
        <div
          className="mb-2 w-80 flex flex-col rounded-xl overflow-hidden shadow-2xl border border-gray-200"
          style={{ height: 400, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 shrink-0">
            <Radio size={11} className={connected ? 'text-emerald-400 animate-pulse' : 'text-gray-600'} />
            <span className="text-xs font-semibold text-gray-800 flex-1">Live Events</span>
            <span className="text-[10px] text-gray-600 font-mono mr-1">{displayed.length}/{events.length}</span>
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={`text-gray-500 hover:text-gray-700 transition-colors ${showFilter ? 'text-gray-800' : ''}`}
              title="Filter by category"
            >
              <Filter size={12} />
            </button>
            <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-700 transition-colors">
              <ChevronDown size={13} />
            </button>
          </div>

          {/* Filter bar */}
          {showFilter && (
            <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b border-gray-200 shrink-0">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value as Category | 'all')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                    filter === f.value
                      ? 'bg-indigo-600 text-gray-900'
                      : 'bg-gray-100 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {/* Event list */}
          <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
            {displayed.length === 0 && (
              <p className="text-gray-700 text-xs py-4 text-center">
                {events.length === 0 ? 'Waiting for events…' : 'No events match this filter.'}
              </p>
            )}
            {displayed.map((e) => {
              const entry = describe(e);
              const badge = CATEGORY_BADGE[entry.category];
              return (
                <div
                  key={e.event_id}
                  className="flex gap-2 px-3 py-2 border-b border-gray-200 hover:bg-gray-100/20 transition-colors"
                >
                  <span className="shrink-0 mt-0.5 text-sm">{entry.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-medium ${entry.cls}`}>{entry.headline}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {entry.detail && (
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug break-words">{entry.detail}</p>
                    )}
                    <p className="text-[10px] text-gray-700 mt-0.5 font-mono">tick {e.tick}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium shadow-lg transition-all ${
          open
            ? 'bg-gray-200 text-gray-900'
            : 'bg-white/90 text-gray-700 hover:bg-gray-100 border border-gray-200'
        }`}
        style={{ backdropFilter: 'blur(8px)' }}
      >
        {open ? <X size={13} /> : <Radio size={13} className={connected ? 'text-emerald-400' : 'text-gray-500'} />}
        <span>Events</span>
        {!open && unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-amber-500 text-gray-900 text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
