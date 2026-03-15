import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, MessageSquare, Users } from 'lucide-react';
import {
  getChatMessages, sendChatMessage, listDmConversations, subscribeToEvents,
} from '../api';
import { useAuth } from '../auth';
import type { ChatMessage, ChatMessageEvent } from '../types';

function ChatBubble({ msg, myId }: { msg: ChatMessage; myId: string }) {
  const isMe = msg.from_player_id === myId;
  return (
    <div className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
      {!isMe && (
        <span className="text-[10px] text-gray-400 mb-0.5 px-1">{msg.from_player_name}</span>
      )}
      <div className={`rounded-2xl px-3 py-1.5 text-sm ${
        isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-200 rounded-bl-sm'
      }`}>
        {msg.content}
      </div>
      <span className="text-[10px] text-gray-700 mt-0.5 px-1">t{msg.sent_at_tick}</span>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
            tab === 'city' ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-gray-200'
          }`}
        >
          <Users size={14} /> City Chat
        </button>

        <div className="mt-2">
          <p className="text-xs text-gray-400 uppercase tracking-widest px-2 mb-1">Direct Messages</p>
          {(conversations?.conversations ?? []).length === 0 && (
            <p className="text-xs text-gray-700 px-2">No conversations yet.</p>
          )}
          {(conversations?.conversations ?? []).map((c) => (
            <button
              key={c.partner_player_id}
              onClick={() => { setTab('dm'); setDmPartner({ id: c.partner_player_id, name: c.partner_player_name }); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === 'dm' && dmPartner?.id === c.partner_player_id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-900 text-gray-400 hover:text-gray-200'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <MessageSquare size={12} />
                <span className="truncate">{c.partner_player_name}</span>
              </div>
              <p className="text-xs text-gray-400 truncate mt-0.5">{c.last_message}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main chat panel ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-white">
            {tab === 'city' ? '🌆 City Chat' : `💬 DM: ${dmPartner?.name}`}
          </h2>
          {tab === 'city' && (
            <p className="text-xs text-gray-400">Public — visible to all players in the city</p>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="text-gray-400 text-xs text-center mt-8">
              {tab === 'city' ? 'No messages yet. Say hello!' : `Start a conversation with ${dmPartner?.name ?? '...'}` }
            </p>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.message_id} msg={m} myId={auth?.player_id ?? ''} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {(tab === 'city' || dmPartner) && (
          <form onSubmit={handleSend} className="shrink-0 flex gap-2 px-3 py-2 border-t border-gray-800">
            <input
              type="text"
              value={tab === 'city' ? input : dmInput}
              onChange={(e) => tab === 'city' ? setInput(e.target.value) : setDmInput(e.target.value)}
              placeholder={tab === 'city' ? 'Message city…' : `Message ${dmPartner?.name}…`}
              maxLength={500}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={tab === 'city' ? sendMut.isPending || !input.trim() : sendDmMut.isPending || !dmInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              <Send size={14} />
            </button>
          </form>
        )}
        {tab === 'dm' && !dmPartner && (
          <p className="text-gray-400 text-xs text-center py-3">Select a conversation from the sidebar.</p>
        )}
      </div>
    </div>
  );
}
