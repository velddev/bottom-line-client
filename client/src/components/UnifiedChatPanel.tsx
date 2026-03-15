import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Radio, ChevronDown, X, Users } from 'lucide-react';
import { getChatMessages, sendChatMessage } from '../api';
import { api } from '../api';
import { useAuth } from '../auth';
import type { ChatMessage, ChatMessageEvent, GameEvent } from '../types';
import { fmtMoney } from '../types';

// ── Event description helper (same logic as EventLogOverlay) ──────────────────
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

// ── Chat bubble ───────────────────────────────────────────────────────────────
function Bubble({
  msg,
  myId,
  onClickName,
}: {
  msg: ChatMessage;
  myId: string;
  onClickName: (playerId: string, playerName: string) => void;
}) {
  const isMe = msg.from_player_id === myId;
  return (
    <div className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
      {!isMe && (
        <button
          onClick={() => onClickName(msg.from_player_id, msg.from_player_name)}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 mb-0.5 px-1 transition-colors text-left"
        >
          {msg.from_player_name}
        </button>
      )}
      <div className={`rounded-xl px-2.5 py-1 text-xs leading-snug ${
        isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'
      }`}>
        {msg.content}
      </div>
    </div>
  );
}

// ── Tab button helper ─────────────────────────────────────────────────────────
function TabBtn({
  active,
  onClick,
  unreadCount,
  children,
}: {
  active: boolean;
  onClick: () => void;
  unreadCount?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 shrink-0 transition-colors ${
        active ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
    >
      {children}
      {!!unreadCount && unreadCount > 0 && (
        <span className="bg-indigo-500 text-white text-[9px] font-bold rounded-full px-1 min-w-[14px] text-center leading-4">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface DmTab {
  playerId: string;
  playerName: string;
}

export default function UnifiedChatPanel({ cityId, apiKey }: { cityId: string; apiKey: string }) {
  const { auth } = useAuth();
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('events');
  const [dmTabs, setDmTabs] = useState<DmTab[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [input, setInput] = useState('');
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [connected, setConnected] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const eventsListRef = useRef<HTMLDivElement>(null);

  const activeDmId = activeTab.startsWith('dm:') ? activeTab.slice(3) : null;

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: cityData } = useQuery({
    queryKey: ['chat', 'city', cityId],
    queryFn: () => getChatMessages(cityId, '', 40),
    enabled: !!cityId,
    refetchInterval: 15_000,
  });
  const cityMessages: ChatMessage[] = cityData?.messages ?? [];

  const { data: dmData } = useQuery({
    queryKey: ['chat', 'dm', cityId, activeDmId],
    queryFn: () => getChatMessages(cityId, activeDmId!, 40),
    enabled: !!cityId && !!activeDmId,
    refetchInterval: 10_000,
  });
  const dmMessages: ChatMessage[] = dmData?.messages ?? [];

  // ── SSE subscription ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!cityId || !apiKey) return;
    const unsub = api.subscribeToEvents(
      cityId,
      apiKey,
      (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 200));

        if (event.chat_message) {
          const m = event.chat_message as ChatMessageEvent;
          const isDm = !!m.to_player_id;

          if (isDm) {
            const senderId = m.from_player_id;
            const senderName = m.from_player_name;
            // Auto-open a tab for incoming DMs from other players
            if (senderId !== auth?.player_id) {
              setDmTabs((prev) => {
                if (prev.find((t) => t.playerId === senderId)) return prev;
                return [...prev, { playerId: senderId, playerName: senderName }];
              });
            }
            qc.invalidateQueries({ queryKey: ['chat', 'dm'] });
            qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
            const dmTabKey = `dm:${senderId}`;
            if (!open || activeTab !== dmTabKey) {
              setUnread((prev) => ({ ...prev, [dmTabKey]: (prev[dmTabKey] ?? 0) + 1 }));
            }
          } else {
            qc.invalidateQueries({ queryKey: ['chat', 'city'] });
            if (!open || activeTab !== 'city') {
              setUnread((prev) => ({ ...prev, city: (prev.city ?? 0) + 1 }));
            }
          }
        } else {
          // Non-chat game event
          if (!open || activeTab !== 'events') {
            setUnread((prev) => ({ ...prev, events: (prev.events ?? 0) + 1 }));
          }
        }
      },
      () => setConnected(true),
      () => setConnected(false),
    );
    return () => {
      unsub();
      setConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cityId, apiKey]);

  // Clear unread when tab becomes active
  useEffect(() => {
    if (open) {
      setUnread((prev) => {
        if (!prev[activeTab]) return prev;
        const next = { ...prev };
        delete next[activeTab];
        return next;
      });
    }
  }, [open, activeTab]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if ((activeTab === 'city' || activeDmId) && open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [cityMessages.length, dmMessages.length, activeTab, open, activeDmId]);

  // Auto-scroll events to top (newest)
  useEffect(() => {
    if (activeTab === 'events' && open && eventsListRef.current) {
      eventsListRef.current.scrollTop = 0;
    }
  }, [events.length, activeTab, open]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMut = useMutation({
    mutationFn: () => sendChatMessage(input.trim(), activeDmId ?? undefined),
    onSuccess: () => {
      setInput('');
      if (activeDmId) {
        qc.invalidateQueries({ queryKey: ['chat', 'dm'] });
      } else {
        qc.invalidateQueries({ queryKey: ['chat', 'city'] });
      }
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMut.mutate();
  };

  // ── DM tab management ──────────────────────────────────────────────────────
  const openDmTab = (playerId: string, playerName: string) => {
    setDmTabs((prev) => {
      if (prev.find((t) => t.playerId === playerId)) return prev;
      return [...prev, { playerId, playerName }];
    });
    setActiveTab(`dm:${playerId}`);
    setOpen(true);
  };

  const closeDmTab = (playerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDmTabs((prev) => prev.filter((t) => t.playerId !== playerId));
    if (activeTab === `dm:${playerId}`) setActiveTab('city');
    setUnread((prev) => {
      const next = { ...prev };
      delete next[`dm:${playerId}`];
      return next;
    });
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const showChat = activeTab === 'city' || !!activeDmId;
  const activeMessages = activeTab === 'city' ? cityMessages : dmMessages;
  const chatPlaceholder = activeDmId
    ? `Message ${dmTabs.find((t) => t.playerId === activeDmId)?.playerName ?? 'player'}…`
    : 'Message city…';

  return (
    <div className="absolute bottom-4 left-4 z-[1001] flex flex-col items-start">
      {open && (
        <div
          className="mb-2 w-80 flex flex-col rounded-xl overflow-hidden shadow-2xl border border-gray-700"
          style={{ height: 340, background: 'rgba(17,24,39,0.93)', backdropFilter: 'blur(8px)' }}
        >
          {/* ── Tab bar ──────────────────────────────────────────────────── */}
          <div
            className="flex items-center border-b border-gray-700/60 shrink-0 overflow-x-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            <TabBtn
              active={activeTab === 'events'}
              onClick={() => setActiveTab('events')}
              unreadCount={unread.events}
            >
              <Radio size={10} className={connected ? 'text-emerald-400' : 'text-gray-600'} />
              Events
            </TabBtn>

            <TabBtn
              active={activeTab === 'city'}
              onClick={() => setActiveTab('city')}
              unreadCount={unread.city}
            >
              <Users size={10} />
              City
            </TabBtn>

            {dmTabs.map((t) => {
              const tabKey = `dm:${t.playerId}`;
              const isActive = activeTab === tabKey;
              return (
                <div
                  key={t.playerId}
                  className={`flex items-center shrink-0 border-b-2 transition-colors ${
                    isActive ? 'border-indigo-500 text-white' : 'border-transparent text-gray-500'
                  }`}
                >
                  <button
                    onClick={() => setActiveTab(tabKey)}
                    className="flex items-center gap-1 pl-2 pr-0.5 py-2 text-xs hover:text-gray-200 transition-colors"
                  >
                    <MessageSquare size={10} />
                    <span className="max-w-[56px] truncate">{t.playerName}</span>
                    {(unread[tabKey] ?? 0) > 0 && (
                      <span className="bg-indigo-500 text-white text-[9px] font-bold rounded-full px-1 min-w-[14px] text-center leading-4 ml-0.5">
                        {unread[tabKey] > 99 ? '99+' : unread[tabKey]}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(e) => closeDmTab(t.playerId, e)}
                    className="px-1.5 py-2 text-gray-700 hover:text-gray-400 transition-colors"
                    title="Close"
                  >
                    <X size={9} />
                  </button>
                </div>
              );
            })}

            <button
              onClick={() => setOpen(false)}
              className="ml-auto px-3 py-2 text-gray-600 hover:text-gray-300 transition-colors shrink-0"
            >
              <ChevronDown size={13} />
            </button>
          </div>

          {/* ── Events tab content ────────────────────────────────────────── */}
          {activeTab === 'events' && (
            <div ref={eventsListRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0">
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
          )}

          {/* ── Chat tab content ──────────────────────────────────────────── */}
          {showChat && (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 min-h-0">
                {activeMessages.length === 0 && (
                  <p className="text-gray-600 text-xs text-center mt-6">
                    {activeTab === 'city' ? 'No messages yet. Say hello!' : 'No messages yet with this player.'}
                  </p>
                )}
                {activeMessages.map((m) => (
                  <Bubble
                    key={m.message_id}
                    msg={m}
                    myId={auth?.player_id ?? ''}
                    onClickName={openDmTab}
                  />
                ))}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={handleSend}
                className="shrink-0 flex gap-1.5 px-2 py-2 border-t border-gray-700/60"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={chatPlaceholder}
                  maxLength={500}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={sendMut.isPending || !input.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Send size={12} />
                </button>
              </form>
            </>
          )}
        </div>
      )}

      {/* ── Toggle button ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium shadow-lg transition-all ${
          open
            ? 'bg-indigo-600 text-white'
            : 'bg-gray-900/90 text-gray-300 hover:bg-gray-800 border border-gray-700'
        }`}
        style={{ backdropFilter: 'blur(8px)' }}
      >
        {open ? <X size={13} /> : <MessageSquare size={13} />}
        <span>Chat</span>
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}
