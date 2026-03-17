import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Radio } from 'lucide-react';
import type { GameEvent } from '../types';
import { fmtMoney, tickToDate } from '../types';
import { api } from '../api';

function describeEvent(e: GameEvent): { icon: string; text: string; cls: string } {
  if (e.tick_completed)
    return { icon: '🕐', text: `${tickToDate(e.tick)} complete`, cls: 'text-gray-600' };
  if (e.resource_produced)
    return { icon: '🏭', text: `Produced ${e.resource_produced.quantity.toFixed(1)}× ${e.resource_produced.resource_type} (Q${e.resource_produced.quality.toFixed(2)})`, cls: 'text-slate-700' };
  if (e.trade_completed)
    return { icon: '💰', text: `Trade: ${e.trade_completed.quantity.toFixed(1)}× ${e.trade_completed.resource_type} for ${fmtMoney(e.trade_completed.total_price)}`, cls: 'text-emerald-400' };
  if (e.market_price_changed) {
    const { resource_type, old_median_price: old, new_median_price: nw } = e.market_price_changed;
    const dir = nw > old ? '↑' : '↓';
    return { icon: '📈', text: `${resource_type}: ${fmtMoney(old)} ${dir} ${fmtMoney(nw)}`, cls: nw > old ? 'text-emerald-400' : 'text-rose-400' };
  }
  if (e.building_constructed)
    return { icon: '🏗️', text: `New ${e.building_constructed.building_type} constructed`, cls: 'text-indigo-300' };
  if (e.election_announced)
    return { icon: '🗳️', text: `Election announced (voting @ Day ${e.election_announced.voting_start_tick})`, cls: 'text-amber-400' };
  if (e.election_concluded)
    return { icon: '🏛️', text: `Election concluded — winner: ${e.election_concluded.winner_player_id.slice(0, 8)}…`, cls: 'text-purple-400' };
  if (e.agreement_changed)
    return { icon: '🤝', text: `Agreement ${e.agreement_changed.agreement_id.slice(0, 8)}… → ${e.agreement_changed.new_status}`, cls: 'text-blue-300' };
  if (e.brand_value_changed)
    return { icon: '📣', text: `Brand weight: ${e.brand_value_changed.old_weight.toFixed(3)} → ${e.brand_value_changed.new_weight.toFixed(3)}`, cls: 'text-pink-400' };
  if (e.taxes_collected)
    return { icon: '💸', text: `Taxes collected: ${fmtMoney(e.taxes_collected.total_collected)}`, cls: 'text-orange-400' };
  if (e.chat_message) {
    const c = e.chat_message;
    const isDm = !!c.to_player_id;
    return {
      icon: isDm ? '💬' : '🗣️',
      text: isDm
        ? `[DM] ${c.from_player_name} → ${c.to_player_name}: ${c.content}`
        : `${c.from_player_name}: ${c.content}`,
      cls: isDm ? 'text-indigo-300' : 'text-gray-700',
    };
  }
  return { icon: '•', text: 'Unknown event', cls: 'text-gray-600' };
}

export default function EventFeed({ cityId, apiKey }: { cityId: string; apiKey: string }) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [open, setOpen] = useState(true);
  const [connected, setConnected] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cityId || !apiKey) return;

    const unsubscribe = api.subscribeToEvents(
      cityId,
      apiKey,
      (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 200));
      },
      () => setConnected(true),
      () => setConnected(false),
    );

    return () => { unsubscribe(); setConnected(false); };
  }, [cityId, apiKey]);

  return (
    <div className="shrink-0 border-t border-gray-200 bg-gray-100">
      {/* Toggle header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-gray-500 hover:text-gray-700 transition-colors"
      >
        <Radio size={12} className={connected ? 'text-emerald-400 animate-pulse' : 'text-gray-600'} />
        <span className="uppercase tracking-widest">Live Events</span>
        <span className="ml-auto text-gray-700">{events.length}</span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {open && (
        <div ref={listRef} className="h-28 overflow-y-auto px-4 pb-2 space-y-0.5">
          {events.length === 0 && (
            <p className="text-gray-700 text-xs py-2">Waiting for events…</p>
          )}
          {events.map((e) => {
            const { icon, text, cls } = describeEvent(e);
            return (
              <div key={e.event_id} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 w-4">{icon}</span>
                <span className="text-gray-500 font-mono shrink-0">Day {e.tick}</span>
                <span className={cls}>{text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
