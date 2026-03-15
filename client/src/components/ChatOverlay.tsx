import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, X, ChevronDown } from 'lucide-react';
import { getChatMessages, sendChatMessage, subscribeToEvents } from '../api';
import { useAuth } from '../auth';
import type { ChatMessage, ChatMessageEvent } from '../types';

function Bubble({ msg, myId }: { msg: ChatMessage; myId: string }) {
  const isMe = msg.from_player_id === myId;
  return (
    <div className={`flex flex-col max-w-[85%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}>
      {!isMe && (
        <span className="text-[10px] text-gray-500 mb-0.5 px-1">{msg.from_player_name}</span>
      )}
      <div className={`rounded-xl px-2.5 py-1 text-xs leading-snug ${
        isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'
      }`}>
        {msg.content}
      </div>
    </div>
  );
}

export default function ChatOverlay() {
  const { auth } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const { data } = useQuery({
    queryKey: ['chat', 'city', auth?.city_id],
    queryFn: () => getChatMessages(auth!.city_id, '', 40),
    enabled: !!auth?.city_id,
    refetchInterval: 15_000,
  });

  const messages = data?.messages ?? [];

  // Track unread count when panel is closed
  useEffect(() => {
    const count = messages.length;
    if (count > prevCountRef.current) {
      if (!open) setUnread((u) => u + (count - prevCountRef.current));
    }
    prevCountRef.current = count;
  }, [messages.length, open]);

  // Clear unread when opened
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  // SSE live updates
  useEffect(() => {
    if (!auth?.city_id || !auth?.api_key) return;
    const unsub = subscribeToEvents(auth.city_id, auth.api_key, (event) => {
      if (event.chat_message) {
        const m = event.chat_message as ChatMessageEvent;
        if (!m.to_player_id) {
          qc.invalidateQueries({ queryKey: ['chat', 'city'] });
        }
      }
    });
    return () => unsub();
  }, [auth?.city_id, auth?.api_key, qc]);

  // Auto-scroll on new messages when open
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, open]);

  const sendMut = useMutation({
    mutationFn: () => sendChatMessage(input.trim()),
    onSuccess: () => {
      setInput('');
      qc.invalidateQueries({ queryKey: ['chat', 'city'] });
    },
  });

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) sendMut.mutate();
  };

  return (
    <div className="absolute bottom-4 left-4 z-[1001] flex flex-col items-start">
      {/* Expanded chat panel */}
      {open && (
        <div
          className="mb-2 w-72 flex flex-col rounded-xl overflow-hidden shadow-2xl border border-gray-700"
          style={{ height: 300, background: 'rgba(17,24,39,0.92)', backdropFilter: 'blur(8px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/60 shrink-0">
            <span className="text-xs font-semibold text-gray-200">🌆 City Chat</span>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1.5 min-h-0">
            {messages.length === 0 && (
              <p className="text-gray-600 text-xs text-center mt-6">No messages yet. Say hello!</p>
            )}
            {messages.map((m) => (
              <Bubble key={m.message_id} msg={m} myId={auth?.player_id ?? ''} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSend}
            className="shrink-0 flex gap-1.5 px-2 py-2 border-t border-gray-700/60"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message city…"
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
        </div>
      )}

      {/* Toggle button */}
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
        {!open && unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
