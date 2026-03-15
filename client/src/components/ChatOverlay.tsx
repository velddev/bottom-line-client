import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, X, ChevronDown, ArrowLeft, Users } from 'lucide-react';
import { getChatMessages, sendChatMessage, listDmConversations, subscribeToEvents } from '../api';
import { useAuth } from '../auth';
import type { ChatMessage, ChatMessageEvent, DmConversation } from '../types';
import AlertBubble from './ui/AlertBubble';

// ── Mention-aware content renderer ───────────────────────────────────────────
function renderWithMentions(content: string, myUsername: string): React.ReactNode {
  const parts = content.split(/(@\S+)/g);
  return parts.map((part, i) => {
    if (!part.startsWith('@')) return part;
    const handle = part.slice(1);
    const isMe = handle.toLowerCase() === myUsername.toLowerCase();
    return (
      <mark
        key={i}
        className={isMe
          ? 'bg-amber-400/30 text-amber-600 dark:text-amber-400 not-italic rounded px-0.5'
          : 'bg-transparent text-indigo-500 dark:text-indigo-400 not-italic'}
      >
        {part}
      </mark>
    );
  });
}

function Bubble({ msg, myId, myUsername }: { msg: ChatMessage; myId: string; myUsername: string }) {
  const isMe = msg.from_player_id === myId;
  const isMentioned = !isMe && msg.content.toLowerCase().includes(`@${myUsername.toLowerCase()}`);
  return (
    <div className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
      {!isMe && (
        <span className="text-[10px] text-gray-500 mb-0.5 px-1">{msg.from_player_name}</span>
      )}
      <div className={`rounded-xl px-2.5 py-1 text-xs leading-snug ${
        isMe
          ? 'bg-indigo-600 text-gray-900 rounded-br-none'
          : isMentioned
            ? 'bg-amber-400/15 text-gray-800 ring-1 ring-amber-400/50 rounded-bl-none'
            : 'bg-gray-200 text-gray-800 rounded-bl-none'
      }`}>
        {renderWithMentions(msg.content, myUsername)}
      </div>
    </div>
  );
}

type Tab = 'city' | 'dm';

export default function ChatOverlay() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<Tab>('city');
  const [dmThread, setDmThread] = useState<{ id: string; name: string } | null>(null);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCityCountRef = useRef(0);
  const prevDmCountRef = useRef(0);

  // ── City chat ──────────────────────────────────────────────────────────────
  const { data: cityData } = useQuery({
    queryKey: ['chat', 'city', auth?.city_id],
    queryFn: () => getChatMessages(auth!.city_id, '', 40),
    enabled: !!auth?.city_id,
    refetchInterval: 15_000,
  });
  const cityMessages: ChatMessage[] = cityData?.messages ?? [];

  // ── DM conversations list ──────────────────────────────────────────────────
  const { data: convData } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: listDmConversations,
    refetchInterval: 20_000,
  });
  const conversations: DmConversation[] = convData?.conversations ?? [];

  // ── Active DM thread ───────────────────────────────────────────────────────
  const { data: dmData } = useQuery({
    queryKey: ['chat', 'dm', auth?.city_id, dmThread?.id],
    queryFn: () => getChatMessages(auth!.city_id, dmThread!.id, 40),
    enabled: !!auth?.city_id && !!dmThread,
    refetchInterval: 10_000,
  });
  const dmMessages: ChatMessage[] = dmData?.messages ?? [];

  const activeMessages = tab === 'city' ? cityMessages : dmMessages;

  // ── Unread badge ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      const cityNew = cityMessages.length - prevCityCountRef.current;
      if (cityNew > 0) setUnread((u) => u + cityNew);
    }
    prevCityCountRef.current = cityMessages.length;
  }, [cityMessages.length, open]);

  useEffect(() => {
    if (!open) {
      const dmNew = dmMessages.length - prevDmCountRef.current;
      if (dmNew > 0) setUnread((u) => u + dmNew);
    }
    prevDmCountRef.current = dmMessages.length;
  }, [dmMessages.length, open]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // ── SSE live updates ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!auth?.city_id || !auth?.api_key) return;
    const unsub = subscribeToEvents(auth.city_id, auth.api_key, (event) => {
      if (!event.chat_message) return;
      const m = event.chat_message as ChatMessageEvent;
      if (!m.to_player_id) {
        qc.invalidateQueries({ queryKey: ['chat', 'city'] });
      } else if (m.from_player_id === auth.player_id || m.to_player_id === auth.player_id) {
        qc.invalidateQueries({ queryKey: ['chat', 'dm'] });
        qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      }
    });
    return () => unsub();
  }, [auth?.city_id, auth?.api_key, auth?.player_id, qc]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, open, tab, dmThread]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendMut = useMutation({
    mutationFn: () => sendChatMessage(input.trim(), tab === 'dm' ? dmThread?.id : undefined),
    onSuccess: () => {
      setInput('');
      if (tab === 'city') {
        qc.invalidateQueries({ queryKey: ['chat', 'city'] });
      } else {
        qc.invalidateQueries({ queryKey: ['chat', 'dm'] });
        qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      }
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (tab === 'dm' && !dmThread) return;
    sendMut.mutate();
  };

  const showDmThread = tab === 'dm' && !!dmThread;
  const showDmList   = tab === 'dm' && !dmThread;
  const showInput    = tab === 'city' || showDmThread;

  return (
    <div className="absolute bottom-4 left-4 z-[1001] flex flex-col items-start">
      {open && (
        <div
          className="mb-2 w-72 flex flex-col rounded-xl overflow-hidden overlay-panel shadow-overlay border border-gray-200"
          style={{ height: 320 }}
        >
          {/* Tab / thread header */}
          <div className="flex items-center border-b border-gray-200 shrink-0">
            {showDmThread ? (
              <button
                onClick={() => { setDmThread(null); setInput(''); }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={12} />
                <span className="truncate max-w-[160px] font-medium text-gray-800">{dmThread.name}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setTab('city')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
                    tab === 'city' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Users size={11} /> City
                </button>
                <button
                  onClick={() => setTab('dm')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
                    tab === 'dm' ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <MessageSquare size={11} /> DM
                </button>
              </>
            )}
            <button
              onClick={() => setOpen(false)}
              className="ml-auto px-3 py-2 text-gray-600 hover:text-gray-700 transition-colors"
            >
              <ChevronDown size={13} />
            </button>
          </div>

          {/* DM conversation list */}
          {showDmList && (
            <div className="flex-1 overflow-y-auto min-h-0">
              {conversations.length === 0 ? (
                <p className="text-gray-600 text-xs text-center mt-8 px-4">No direct messages yet.</p>
              ) : conversations.map((c) => (
                <button
                  key={c.partner_player_id}
                  onClick={() => setDmThread({ id: c.partner_player_id, name: c.partner_player_name })}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-100/60 transition-colors border-b border-gray-200"
                >
                  <div className="flex items-center gap-1.5">
                    <MessageSquare size={11} className="text-indigo-400 shrink-0" />
                    <span className="text-xs text-gray-800 font-medium truncate">{c.partner_player_name}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 truncate mt-0.5 pl-[19px]">{c.last_message}</p>
                </button>
              ))}
            </div>
          )}

          {/* Chat bubbles (city or DM thread) */}
          {(tab === 'city' || showDmThread) && (
            <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 min-h-0">
              {activeMessages.length === 0 && (
                <p className="text-gray-600 text-xs text-center mt-6">
                  {tab === 'city' ? 'No messages yet. Say hello!' : `Start a conversation with ${dmThread?.name}…`}
                </p>
              )}
              {activeMessages.map((m) => (
                <Bubble key={m.message_id} msg={m} myId={auth?.player_id ?? ''} myUsername={auth?.username ?? ''} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          {showInput && (
            <form
              onSubmit={handleSend}
              className="shrink-0 flex gap-1.5 px-2 py-2 border-t border-gray-200"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={tab === 'city' ? 'Message city…' : `Message ${dmThread?.name}…`}
                maxLength={500}
                className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={sendMut.isPending || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-gray-900 px-2.5 py-1 rounded-lg transition-colors"
              >
                <Send size={12} />
              </button>
            </form>
          )}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium overlay-panel transition-all ${
          open
            ? 'bg-indigo-600 text-gray-900'
            : 'text-gray-700 hover:text-gray-900'
        }`}
      >
        {open ? <X size={13} /> : <MessageSquare size={13} />}
        <span>Chat</span>
        {!open && <AlertBubble count={unread} className="absolute -top-1.5 -right-1.5" />}
      </button>
    </div>
  );
}
