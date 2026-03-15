import { useEffect, useRef, useState } from 'react';
import { Radio, X, ChevronDown } from 'lucide-react';
import type { GameEvent } from '../types';
import { fmtMoney } from '../types';
import { api } from '../api';

function describeEvent(e: GameEvent): { icon: string; text: string; cls: string } {
  if (e.tick_completed)
    return { icon: '🕐', text: `Tick ${e.tick} complete`, cls: 'text-gray-500' };
  if (e.resource_produced)
    return { icon: '🏭', text: `Produced ${e.resource_produced.quantity.toFixed(1)}× ${e.resource_produced.resource_type}`, cls: 'text-slate-300' };
  if (e.trade_completed)
    return { icon: '💰', text: `${e.trade_completed.quantity.toFixed(1)}× ${e.trade_completed.resource_type} — ${fmtMoney(e.trade_completed.total_price)}`, cls: 'text-emerald-400' };
  if (e.market_price_changed) {
    const { resource_type, old_median_price: old, new_median_price: nw } = e.market_price_changed;
    const dir = nw > old ? '↑' : '↓';
    return { icon: '📈', text: `${resource_type}: ${fmtMoney(old)} ${dir} ${fmtMoney(nw)}`, cls: nw > old ? 'text-emerald-400' : 'text-rose-400' };
  }
  if (e.building_constructed)
    return { icon: '🏗️', text: `New ${e.building_constructed.building_type} constructed`, cls: 'text-indigo-300' };
  if (e.election_announced)
    return { icon: '🗳️', text: `Election announced (voting @ tick ${e.election_announced.voting_start_tick})`, cls: 'text-amber-400' };
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
      text: isDm ? `[DM] ${c.from_player_name}: ${c.content}` : `${c.from_player_name}: ${c.content}`,
      cls: 'text-gray-400',
    };
  }
  return { icon: '•', text: 'Event', cls: 'text-gray-600' };
}

export default function EventLogOverlay({ cityId, apiKey }: { cityId: string; apiKey: string }) {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (!cityId || !apiKey) return;
    const unsub = api.subscribeToEvents(
      cityId,
      apiKey,
      (event) => setEvents((prev) => [event, ...prev].slice(0, 200)),
      () => setConnected(true),
      () => setConnected(false),
    );
    return () => { unsub(); setConnected(false); };
  }, [cityId, apiKey]);

  // Unread count when closed
  useEffect(() => {
    if (!open) {
      const newCount = events.length - prevCountRef.current;
      if (newCount > 0) setUnread((u) => u + newCount);
    }
    prevCountRef.current = events.length;
  }, [events.length, open]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // Auto-scroll to top (newest event) when panel is open
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = 0;
  }, [events.length, open]);

  return (
    <div className="absolute bottom-4 right-4 z-[1001] flex flex-col items-end">
      {open && (
        <div
          className="mb-2 w-72 flex flex-col rounded-xl overflow-hidden shadow-2xl border border-gray-700"
          style={{ height: 300, background: 'rgba(17,24,39,0.93)', backdropFilter: 'blur(8px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/60 shrink-0">
            <div className="flex items-center gap-2">
              <Radio
                size={11}
                className={connected ? 'text-emerald-400 animate-pulse' : 'text-gray-600'}
              />
              <span className="text-xs font-semibold text-gray-200">Live Events</span>
              <span className="text-[10px] text-gray-600 font-mono">{events.length}</span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-gray-300 transition-colors">
              <ChevronDown size={13} />
            </button>
          </div>

          {/* Event list */}
          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
            {events.length === 0 && (
              <p className="text-gray-700 text-xs py-2 text-center">Waiting for events…</p>
            )}
            {events.map((e) => {
              const { icon, text, cls } = describeEvent(e);
              return (
                <div key={e.event_id} className="flex items-start gap-1.5 text-xs">
                  <span className="shrink-0 w-4 mt-px">{icon}</span>
                  <span className="text-gray-700 font-mono shrink-0 tabular-nums">t{e.tick}</span>
                  <span className={`${cls} leading-snug`}>{text}</span>
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
            ? 'bg-gray-700 text-white'
            : 'bg-gray-900/90 text-gray-300 hover:bg-gray-800 border border-gray-700'
        }`}
        style={{ backdropFilter: 'blur(8px)' }}
      >
        {open ? <X size={13} /> : <Radio size={13} className={connected ? 'text-emerald-400' : 'text-gray-500'} />}
        <span>Events</span>
        {!open && unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-amber-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
