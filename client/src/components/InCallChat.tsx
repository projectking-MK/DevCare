import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  X, 
  MessageSquare, 
  Volume2, 
  VolumeX, 
  User, 
  Smile,
  Sparkles
} from 'lucide-react';
import { getSocket } from '../services/socket';

export interface InCallChatMessage {
  id: string;
  sessionId: string;
  sender: 'parent' | 'child';
  senderName: string;
  text: string;
  timestamp: string;
}

interface InCallChatProps {
  sessionId: string;
  role: 'parent' | 'child';
  peerName: string;
  isOpen: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
  className?: string;
}

export const InCallChat: React.FC<InCallChatProps> = ({
  sessionId,
  role,
  peerName,
  isOpen,
  onClose,
  onUnreadCountChange,
  className = ''
}) => {
  const [messages, setMessages] = useState<InCallChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unreadCountRef = useRef(0);
  const isOpenRef = useRef(isOpen);

  isOpenRef.current = isOpen;

  // Synthesized notification chime using Web Audio API
  const playMessageSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch {
      // AudioContext could be restricted before user gesture
    }
  };

  // Fetch history and listen for in-call messages
  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    // Fetch existing session messages
    socket.emit('chat:get_history', { sessionId }, (res: { success?: boolean; messages?: InCallChatMessage[] }) => {
      if (res?.success && Array.isArray(res.messages)) {
        setMessages(res.messages);
      }
    });

    const handleMessage = (msg: InCallChatMessage) => {
      if (msg.sessionId !== sessionId) return;

      setMessages((prev) => {
        // Prevent duplicate IDs
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // If message is from counterpart
      if (msg.sender !== role) {
        playMessageSound();
        if (!isOpenRef.current) {
          unreadCountRef.current += 1;
          onUnreadCountChange?.(unreadCountRef.current);
        }
      }
    };

    socket.on('chat:message', handleMessage);

    return () => {
      socket.off('chat:message', handleMessage);
    };
  }, [sessionId, role, soundEnabled, onUnreadCountChange]);

  // Reset unread count when opened
  useEffect(() => {
    if (isOpen) {
      unreadCountRef.current = 0;
      onUnreadCountChange?.(0);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, onUnreadCountChange]);

  // Auto-scroll on new message if open
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Send message
  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!text || !sessionId) return;

    const socket = getSocket();
    const tempId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    socket.emit('chat:message', {
      sessionId,
      text,
      id: tempId
    });

    if (textToSend === undefined) {
      setInputText('');
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickReplies = role === 'parent' ? [
    '👋 Hello!',
    'Can you hear me clearly?',
    'Please share your screen 🖥️',
    'Great job! Keep going 👍',
    'Take a 5-minute break ⏳'
  ] : [
    '👋 Hi!',
    'Can you hear me?',
    'Look at my screen 🖥️',
    'Need help with this! 💡',
    'All done! 👍'
  ];

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed z-[70] flex flex-col bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${className}`}
      style={{ minHeight: '360px', maxHeight: '520px' }}
    >
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white tracking-tight">In-Call Chat</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-[11px] text-slate-400">
              Chatting with {peerName}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title={soundEnabled ? 'Mute notification sound' : 'Unmute notification sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-3.5 space-y-3 overflow-y-auto custom-scrollbar text-xs">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
            <Sparkles className="w-8 h-8 text-emerald-500/40" />
            <p className="font-medium text-slate-400">In-Call Chat is Active</p>
            <p className="text-[11px] text-slate-500 max-w-[200px]">
              Send a quick message or note to {peerName} during the call.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender === role;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
              >
                <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 px-1">
                  <span>{isMe ? 'You' : msg.senderName}</span>
                  <span>•</span>
                  <span>{formatTime(msg.timestamp)}</span>
                </div>
                <div
                  className={`px-3 py-2 rounded-2xl max-w-[85%] break-words shadow-md leading-relaxed ${
                    isMe
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-tr-xs'
                      : 'bg-slate-800/90 border border-slate-700 text-slate-100 rounded-tl-xs'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reply Chips */}
      <div className="px-3 py-1.5 border-t border-slate-800/80 bg-slate-950/40 flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
        {quickReplies.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(chip)}
            className="flex-shrink-0 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700/80 text-[11px] text-slate-300 hover:text-white transition-all cursor-pointer whitespace-nowrap"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Field */}
      <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center space-x-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type message & press Enter..."
          className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors"
        />
        <button
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white transition-all cursor-pointer shadow-md"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
