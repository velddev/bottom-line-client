import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, MessageSquare, Users } from 'lucide-react';
import {
  getChatMessages, sendChatMessage, listDmConversations, subscribeToEvents, findPlayerByHandle,
} from '../api';
import { useAuth } from '../auth';
import type { ChatMessage, ChatMessageEvent } from '../types';

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

function ChatBubble({ msg, myId, myUsername }: { msg: ChatMessage; myId: string; myUsername: string }) {
  const isMe = msg.from_player_id === myId;
  const isMentioned = !isMe && msg.content.toLowerCase().includes(`@${myUsername.toLowerCase()}`);
  return (
    <div className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
      {!isMe && (
        <span className="text-[10px] text-gray-600 mb-0.5 px-1">{msg.from_player_name}</span>
      )}
      <div className={`rounded-2xl px-3 py-1.5 text-sm ${
        isMe
          ? 'bg-indigo-600 text-gray-900 rounded-br-sm'
          : isMentioned
            ? 'bg-amber-400/15 text-gray-800 ring-1 ring-amber-400/50 rounded-bl-sm'
            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
      }`}>
        {renderWithMentions(msg.content, myUsername)}
      </div>
      <span className="text-[10px] text-gray-700 mt-0.5 px-1">Day {msg.sent_at_tick}</span>
    </div>
  );
}

export default function ChatScreen() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'city' | 'dm'>('city');
  const [dmPartner, setDmPartner] = useState<{ id: string; name: string } | null>(null);
  const [input, setInput] = useState('');
  const [dmInput, setDmInput] = useState('');
  const [newDmHandle, setNewDmHandle] = useState('');
  const [showNewDm, setShowNewDm] = useState(false);
  const [dmLookupError, setDmLookupError] = useState('');
  const [dmLookupPending, setDmLookupPending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const newDmRef = useRef<HTMLInputElement>(null);

  // Public city chat
  const { data: cityChat } = useQuery({
    queryKey: ['chat', 'city', auth?.city_id],
    queryFn: () => getChatMessages(auth!.city_id, '', 50),
    enabled: !!auth?.city_id,
    refetchInterval: 15_000,
  });

  // DM thread
  const { data: dmChat } = useQuery({
    queryKey: ['chat', 'dm', auth?.city_id, dmPartner?.id],
    queryFn: () => getChatMessages(auth!.city_id, dmPartner!.id, 50),
    enabled: !!auth?.city_id && !!dmPartner,
    refetchInterval: 10_000,
  });

  // DM conversations list
  const { data: conversations } = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => listDmConversations(),
    refetchInterval: 15_000,
  });

  // Subscribe to SSE for live chat messages
  useEffect(() => {
    if (!auth?.city_id || !auth?.api_key) return;
    const unsub = subscribeToEvents(
      auth.city_id,
      auth.api_key,
      (event) => {
        if (event.chat_message) {
          const m = event.chat_message as ChatMessageEvent;
          const isDm = !!m.to_player_id;
          if (!isDm) {
            qc.invalidateQueries({ queryKey: ['chat', 'city'] });
          } else if (
            m.from_player_id === auth.player_id ||
            m.to_player_id === auth.player_id
          ) {
            qc.invalidateQueries({ queryKey: ['chat', 'dm'] });
            qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
          }
        }
      },
    );
    return () => unsub();
  }, [auth?.city_id, auth?.api_key, auth?.player_id, qc]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cityChat?.messages, dmChat?.messages]);

  const sendMut = useMutation({
    mutationFn: () => sendChatMessage(input.trim()),
    onSuccess: () => {
      setInput('');
      qc.invalidateQueries({ queryKey: ['chat', 'city'] });
    },
  });

  const sendDmMut = useMutation({
    mutationFn: () => sendChatMessage(dmInput.trim(), dmPartner!.id),
    onSuccess: () => {
      setDmInput('');
      qc.invalidateQueries({ queryKey: ['chat', 'dm'] });
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && tab === 'city') sendMut.mutate();
    else if (dmInput.trim() && tab === 'dm' && dmPartner) sendDmMut.mutate();
  };

  const messages = tab === 'city' ? (cityChat?.messages ?? []) : (dmChat?.messages ?? []);

  return (
    <div className="h-full flex gap-4">

      {/* ── Left sidebar: tabs + DM list ──────────────────────────────────── */}
      <div className="w-52 shrink-0 flex flex-col gap-2">
        <button
          onClick={() => { setTab('city'); setDmPartner(null); }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            tab === 'city' ? 'bg-indigo-600 text-gray-900' : 'bg-gray-200 text-gray-600 hover:text-gray-800'
          }`}
        >
          <Users size={14} /> City Chat
        </button>

        <div className="mt-2">
          <div className="flex items-center justify-between px-2 mb-1">
            <p className="text-xs text-gray-600 uppercase tracking-widest">Direct Messages</p>
            <button
              onClick={() => { setShowNewDm(true); setTimeout(() => newDmRef.current?.focus(), 0); }}
              className="text-gray-500 hover:text-gray-800 transition-colors text-sm leading-none"
              title="New DM"
            >
              +
            </button>
          </div>
          {showNewDm && (
            <div>
              <input
                ref={newDmRef}
                type="text"
                value={newDmHandle}
                onChange={(e) => { setNewDmHandle(e.target.value); setDmLookupError(''); }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const handle = newDmHandle.trim().replace(/^@/, '');
                    if (!handle) { setShowNewDm(false); return; }
                    setDmLookupPending(true);
                    setDmLookupError('');
                    try {
                      const result = await findPlayerByHandle(handle);
                      if (result.found) {
                        setTab('dm');
                        setDmPartner({ id: result.player_id, name: result.username });
                        setNewDmHandle('');
                        setShowNewDm(false);
                      } else {
                        setDmLookupError(`Player "@${handle}" not found.`);
                      }
                    } catch {
                      setDmLookupError('Lookup failed. Try again.');
                    } finally {
                      setDmLookupPending(false);
                    }
                  } else if (e.key === 'Escape') {
                    setNewDmHandle(''); setShowNewDm(false); setDmLookupError('');
                  }
                }}
                onBlur={() => { if (!dmLookupPending) { setNewDmHandle(''); setShowNewDm(false); setDmLookupError(''); } }}
                placeholder="@handle"
                disabled={dmLookupPending}
                className="w-full bg-gray-100 border border-gray-300 focus:border-indigo-400 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-500 focus:outline-none mb-1 disabled:opacity-50"
              />
              {dmLookupError && (
                <p className="text-xs text-red-500 px-1 mb-1">{dmLookupError}</p>
              )}
            </div>
          )}
          {(conversations?.conversations ?? []).length === 0 && !showNewDm && (
            <p className="text-xs text-gray-700 px-2">No conversations yet.</p>
          )}
          {(conversations?.conversations ?? []).map((c) => (
            <button
              key={c.partner_player_id}
              onClick={() => { setTab('dm'); setDmPartner({ id: c.partner_player_id, name: c.partner_player_name }); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === 'dm' && dmPartner?.id === c.partner_player_id
                  ? 'bg-indigo-600 text-gray-900'
                  : 'bg-gray-200 text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <MessageSquare size={12} />
                <span className="truncate">{c.partner_player_name}</span>
              </div>
              <p className="text-xs text-gray-600 truncate mt-0.5">{c.last_message}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main chat panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gray-200 border border-gray-200 rounded-lg overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-900">
            {tab === 'city' ? '🌆 City Chat' : `💬 DM: ${dmPartner?.name}`}
          </h2>
          {tab === 'city' && (
            <p className="text-xs text-gray-600">Public — visible to all players in the city</p>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="text-gray-600 text-xs text-center mt-8">
              {tab === 'city' ? 'No messages yet. Say hello!' : `Start a conversation with ${dmPartner?.name ?? '...'}` }
            </p>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.message_id} msg={m} myId={auth?.player_id ?? ''} myUsername={auth?.username ?? ''} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {(tab === 'city' || dmPartner) && (
          <form onSubmit={handleSend} className="shrink-0 flex gap-2 px-3 py-2 border-t border-gray-200">
            <input
              type="text"
              value={tab === 'city' ? input : dmInput}
              onChange={(e) => tab === 'city' ? setInput(e.target.value) : setDmInput(e.target.value)}
              placeholder={tab === 'city' ? 'Message city…' : `Message ${dmPartner?.name}…`}
              maxLength={500}
              className="flex-1 bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={tab === 'city' ? sendMut.isPending || !input.trim() : sendDmMut.isPending || !dmInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-gray-900 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Send size={14} />
            </button>
          </form>
        )}
        {tab === 'dm' && !dmPartner && (
          <p className="text-gray-600 text-xs text-center py-3">Select a conversation from the sidebar.</p>
        )}
      </div>
    </div>
  );
}
